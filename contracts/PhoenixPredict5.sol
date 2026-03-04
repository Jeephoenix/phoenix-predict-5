// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title PhoenixPredict5 v2
 * @notice Decentralized 5-minute BTC/USD prediction market on Base
 * @dev Adds early exit with penalty fee
 */
contract PhoenixPredict5 is Ownable, Pausable, ReentrancyGuard {

    enum Position { UP, DOWN }

    struct Round {
        uint256 epoch;
        uint256 startTimestamp;
        uint256 lockTimestamp;
        uint256 closeTimestamp;
        int256  lockPrice;
        int256  closePrice;
        uint80  lockOracleId;
        uint80  closeOracleId;
        uint256 totalAmount;
        uint256 upAmount;
        uint256 downAmount;
        uint256 rewardBaseCalAmount;
        uint256 rewardAmount;
        bool    oracleCalled;
    }

    struct BetInfo {
        Position position;
        uint256  amount;
        bool     claimed;
        bool     exited;
    }

    uint256 public constant ROUND_DURATION   = 5 minutes;
    uint256 public constant BUFFER_SECONDS   = 30 seconds;
    uint256 public constant MAX_FEE_RATE     = 1000;
    uint256 public constant MAX_EXIT_PENALTY = 2000;
    uint256 public constant BASIS_POINTS     = 10_000;
    uint256 public constant MIN_BET          = 0.001 ether;

    AggregatorV3Interface public immutable oracle;

    uint256 public currentEpoch;
    uint256 public feeRate;
    uint256 public exitPenaltyRate;
    address public feeRecipient;
    uint256 public treasuryAmount;

    mapping(uint256 => Round)                       public rounds;
    mapping(uint256 => mapping(address => BetInfo)) public ledger;
    mapping(address => uint256[])                   public userRounds;

    event RoundStarted(uint256 indexed epoch, uint256 startTimestamp);
    event RoundLocked(uint256 indexed epoch, uint80 indexed oracleRoundId, int256 price);
    event RoundResolved(uint256 indexed epoch, uint80 indexed oracleRoundId, int256 price, Position result);
    event BetPlaced(uint256 indexed epoch, address indexed user, Position position, uint256 amount);
    event EarlyExit(uint256 indexed epoch, address indexed user, uint256 refund, uint256 penalty);
    event Claimed(address indexed user, uint256 indexed epoch, uint256 amount);
    event TreasuryClaimed(address indexed recipient, uint256 amount);
    event FeeRateUpdated(uint256 oldRate, uint256 newRate);
    event ExitPenaltyRateUpdated(uint256 oldRate, uint256 newRate);

    error RoundNotBettable(uint256 epoch);
    error BetTooSmall(uint256 minimum);
    error AlreadyBet(uint256 epoch, address user);
    error NothingToClaim(uint256 epoch, address user);
    error InvalidFeeRate(uint256 rate);
    error InvalidOracle();
    error OracleDataStale();
    error InvalidAddress();
    error CannotExit(uint256 epoch, address user);

    constructor(
        address _oracle,
        uint256 _feeRate,
        uint256 _exitPenaltyRate,
        address _feeRecipient,
        address _owner
    ) Ownable(_owner) {
        if (_oracle == address(0)) revert InvalidAddress();
        if (_feeRecipient == address(0)) revert InvalidAddress();
        if (_feeRate > MAX_FEE_RATE) revert InvalidFeeRate(_feeRate);
        if (_exitPenaltyRate > MAX_EXIT_PENALTY) revert InvalidFeeRate(_exitPenaltyRate);

        oracle          = AggregatorV3Interface(_oracle);
        feeRate         = _feeRate;
        exitPenaltyRate = _exitPenaltyRate;
        feeRecipient    = _feeRecipient;
    }

    function bet(Position position) external payable nonReentrant whenNotPaused {
        uint256 epoch = currentEpoch;
        if (!_isBettable(epoch)) revert RoundNotBettable(epoch);
        if (msg.value < MIN_BET) revert BetTooSmall(MIN_BET);
        if (ledger[epoch][msg.sender].amount != 0) revert AlreadyBet(epoch, msg.sender);

        Round storage round = rounds[epoch];
        round.totalAmount += msg.value;
        if (position == Position.UP) {
            round.upAmount += msg.value;
        } else {
            round.downAmount += msg.value;
        }

        BetInfo storage info = ledger[epoch][msg.sender];
        info.position = position;
        info.amount   = msg.value;
        userRounds[msg.sender].push(epoch);

        emit BetPlaced(epoch, msg.sender, position, msg.value);
    }

    function exitEarly(uint256 epoch) external nonReentrant whenNotPaused {
        BetInfo storage info = ledger[epoch][msg.sender];
        Round storage round  = rounds[epoch];

        if (
            info.amount == 0 ||
            info.claimed ||
            info.exited ||
            block.timestamp >= round.lockTimestamp
        ) revert CannotExit(epoch, msg.sender);

        uint256 betAmount = info.amount;
        uint256 penalty   = (betAmount * exitPenaltyRate) / BASIS_POINTS;
        uint256 refund    = betAmount - penalty;

        round.totalAmount -= betAmount;
        if (info.position == Position.UP) {
            round.upAmount -= betAmount;
        } else {
            round.downAmount -= betAmount;
        }

        info.exited     = true;
        treasuryAmount += penalty;

        (bool success, ) = payable(msg.sender).call{value: refund}("");
        require(success, "Transfer failed");

        emit EarlyExit(epoch, msg.sender, refund, penalty);
    }

    function claim(uint256[] calldata epochs) external nonReentrant {
        uint256 reward;
        for (uint256 i; i < epochs.length; ) {
            reward += _calculateReward(epochs[i], msg.sender);
            unchecked { ++i; }
        }
        if (reward == 0) revert NothingToClaim(0, msg.sender);
        (bool success, ) = payable(msg.sender).call{value: reward}("");
        require(success, "Transfer failed");
    }

    function executeRound() external whenNotPaused {
        require(currentEpoch > 0, "Genesis not started");
        _lockRound(currentEpoch);
        uint256 newEpoch = currentEpoch + 1;
        _startRound(newEpoch);
        currentEpoch = newEpoch;
    }

    function resolveRound() external whenNotPaused {
        _resolveRound(currentEpoch - 1);
    }

    function genesisStartRound() external onlyOwner whenNotPaused {
        require(currentEpoch == 0, "Already started");
        currentEpoch = 1;
        _startRound(1);
        emit RoundStarted(1, block.timestamp);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setFeeRate(uint256 _feeRate) external onlyOwner {
        if (_feeRate > MAX_FEE_RATE) revert InvalidFeeRate(_feeRate);
        emit FeeRateUpdated(feeRate, _feeRate);
        feeRate = _feeRate;
    }

    function setExitPenaltyRate(uint256 _rate) external onlyOwner {
        if (_rate > MAX_EXIT_PENALTY) revert InvalidFeeRate(_rate);
        emit ExitPenaltyRateUpdated(exitPenaltyRate, _rate);
        exitPenaltyRate = _rate;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        feeRecipient = _feeRecipient;
    }

    function claimTreasury() external nonReentrant {
        require(msg.sender == feeRecipient, "Not fee recipient");
        uint256 amount = treasuryAmount;
        require(amount > 0, "Nothing to claim");
        treasuryAmount = 0;
        (bool success, ) = payable(feeRecipient).call{value: amount}("");
        require(success, "Transfer failed");
        emit TreasuryClaimed(feeRecipient, amount);
    }

    function getCurrentRound() external view returns (Round memory) {
        return rounds[currentEpoch];
    }

    function getRound(uint256 epoch) external view returns (Round memory) {
        return rounds[epoch];
    }

    function getUserRounds(address user) external view returns (uint256[] memory) {
        return userRounds[user];
    }

    function claimable(uint256 epoch, address user) external view returns (bool) {
        BetInfo memory info  = ledger[epoch][user];
        Round   memory round = rounds[epoch];
        if (!round.oracleCalled || info.amount == 0 || info.claimed || info.exited) return false;
        if (round.upAmount == 0 || round.downAmount == 0) return true;
        if (round.closePrice == round.lockPrice) return true;
        if (round.closePrice > round.lockPrice && info.position == Position.UP)   return true;
        if (round.closePrice < round.lockPrice && info.position == Position.DOWN) return true;
        return false;
    }

    function exitableInfo(uint256 epoch, address user) external view returns (
        bool canExit,
        uint256 refundAmount,
        uint256 penaltyAmount
    ) {
        BetInfo memory info  = ledger[epoch][user];
        Round   memory round = rounds[epoch];
        canExit = (
            info.amount > 0 &&
            !info.claimed &&
            !info.exited &&
            block.timestamp < round.lockTimestamp
        );
        if (canExit) {
            penaltyAmount = (info.amount * exitPenaltyRate) / BASIS_POINTS;
            refundAmount  = info.amount - penaltyAmount;
        }
    }

    function getLatestPrice() external view returns (int256 price, uint256 updatedAt) {
        (, price, , updatedAt, ) = oracle.latestRoundData();
    }

    function _startRound(uint256 epoch) internal {
        Round storage round  = rounds[epoch];
        round.epoch          = epoch;
        round.startTimestamp = block.timestamp;
        round.lockTimestamp  = block.timestamp + ROUND_DURATION;
        round.closeTimestamp = block.timestamp + (2 * ROUND_DURATION);
        emit RoundStarted(epoch, block.timestamp);
    }

    function _lockRound(uint256 epoch) internal {
        Round storage round = rounds[epoch];
        require(block.timestamp >= round.lockTimestamp, "Too early to lock");
        require(block.timestamp <= round.lockTimestamp + BUFFER_SECONDS, "Lock window expired");
        (uint80 roundId, int256 price) = _getOraclePrice();
        round.lockPrice    = price;
        round.lockOracleId = roundId;
        emit RoundLocked(epoch, roundId, price);
    }

    function _resolveRound(uint256 epoch) internal {
        Round storage round = rounds[epoch];
        require(round.lockOracleId != 0, "Round not locked");
        require(block.timestamp >= round.closeTimestamp, "Too early to resolve");
        require(!round.oracleCalled, "Already resolved");

        (uint80 roundId, int256 price) = _getOraclePrice();
        round.closePrice    = price;
        round.closeOracleId = roundId;
        round.oracleCalled  = true;

        Position result = price > round.lockPrice ? Position.UP : Position.DOWN;
        _distributeRewards(epoch);
        emit RoundResolved(epoch, roundId, price, result);
    }

    function _distributeRewards(uint256 epoch) internal {
        Round storage round = rounds[epoch];
        uint256 total = round.totalAmount;
        uint256 fee   = (total * feeRate) / BASIS_POINTS;
        uint256 pool  = total - fee;
        treasuryAmount += fee;

        bool upWins   = round.closePrice > round.lockPrice;
        bool downWins = round.closePrice < round.lockPrice;

        if (upWins && round.upAmount > 0) {
            round.rewardBaseCalAmount = round.upAmount;
            round.rewardAmount        = pool;
        } else if (downWins && round.downAmount > 0) {
            round.rewardBaseCalAmount = round.downAmount;
            round.rewardAmount        = pool;
        } else {
            treasuryAmount           -= fee;
            round.rewardBaseCalAmount = total;
            round.rewardAmount        = total;
        }
    }

    function _calculateReward(uint256 epoch, address user) internal returns (uint256 reward) {
        Round   storage round = rounds[epoch];
        BetInfo storage info  = ledger[epoch][user];

        if (info.amount == 0 || info.claimed || info.exited) return 0;

        if (!round.oracleCalled) {
            if (block.timestamp <= round.closeTimestamp + BUFFER_SECONDS) return 0;
            info.claimed = true;
            return info.amount;
        }

        bool upWins   = round.closePrice > round.lockPrice;
        bool downWins = round.closePrice < round.lockPrice;
        bool draw     = round.closePrice == round.lockPrice;
        bool oneEmpty = round.upAmount == 0 || round.downAmount == 0;

        if (draw || oneEmpty) {
            info.claimed = true;
            return info.amount;
        }

        bool isWinner = (upWins && info.position == Position.UP) ||
                        (downWins && info.position == Position.DOWN);
        if (!isWinner) return 0;

        info.claimed = true;
        reward = (info.amount * round.rewardAmount) / round.rewardBaseCalAmount;
    }

    function _isBettable(uint256 epoch) internal view returns (bool) {
        Round memory round = rounds[epoch];
        return (
            round.startTimestamp != 0 &&
            block.timestamp >= round.startTimestamp &&
            block.timestamp < round.lockTimestamp
        );
    }

    function _getOraclePrice() internal view returns (uint80 roundId, int256 price) {
        uint256 updatedAt;
        uint80  answeredInRound;
        (roundId, price, , updatedAt, answeredInRound) = oracle.latestRoundData();
        if (price <= 0)                revert InvalidOracle();
        if (updatedAt == 0)            revert OracleDataStale();
        if (answeredInRound < roundId) revert OracleDataStale();
        if (block.timestamp - updatedAt > 1 hours) revert OracleDataStale();
    }

    receive() external payable { revert("Use bet()"); }
}
