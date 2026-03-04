// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title PhoenixPredict5
 * @notice Decentralized 5-minute BTC/USD prediction market on Base
 * @dev Pool-based payout, Chainlink oracle, no admin price control
 */
contract PhoenixPredict5 is Ownable, Pausable, ReentrancyGuard {
    // ─── Types ────────────────────────────────────────────────────────────────

    enum Position {
        UP,
        DOWN
    }

    struct Round {
        uint256 epoch;
        uint256 startTimestamp;
        uint256 lockTimestamp;
        uint256 closeTimestamp;
        int256 lockPrice;
        int256 closePrice;
        uint80 lockOracleId;
        uint80 closeOracleId;
        uint256 totalAmount;
        uint256 upAmount;
        uint256 downAmount;
        uint256 rewardBaseCalAmount;
        uint256 rewardAmount;
        bool oracleCalled;
    }

    struct BetInfo {
        Position position;
        uint256 amount;
        bool claimed;
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant ROUND_DURATION = 5 minutes;
    uint256 public constant BUFFER_SECONDS = 30 seconds;
    uint256 public constant MAX_FEE_RATE = 1000; // 10% hard cap (basis points)
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MIN_BET = 0.001 ether;

    // ─── State ────────────────────────────────────────────────────────────────

    AggregatorV3Interface public immutable oracle;

    uint256 public currentEpoch;
    uint256 public feeRate; // basis points, e.g. 200 = 2%
    address public feeRecipient;
    uint256 public treasuryAmount;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => BetInfo)) public ledger;
    mapping(address => uint256[]) public userRounds;

    // ─── Events ───────────────────────────────────────────────────────────────

    event RoundStarted(uint256 indexed epoch, uint256 startTimestamp);
    event RoundLocked(uint256 indexed epoch, uint80 indexed oracleRoundId, int256 price);
    event RoundResolved(uint256 indexed epoch, uint80 indexed oracleRoundId, int256 price, Position result);
    event BetPlaced(uint256 indexed epoch, address indexed user, Position position, uint256 amount);
    event Claimed(address indexed user, uint256 indexed epoch, uint256 amount);
    event TreasuryClaimed(address indexed recipient, uint256 amount);
    event FeeRateUpdated(uint256 oldRate, uint256 newRate);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error RoundNotBettable(uint256 epoch);
    error BetTooSmall(uint256 minimum);
    error AlreadyBet(uint256 epoch, address user);
    error RoundNotResolvable(uint256 epoch);
    error NothingToClaim(uint256 epoch, address user);
    error InvalidFeeRate(uint256 rate);
    error InvalidOracle();
    error OracleDataStale();
    error InvalidAddress();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _oracle,
        uint256 _feeRate,
        address _feeRecipient,
        address _owner
    ) Ownable(_owner) {
        if (_oracle == address(0)) revert InvalidAddress();
        if (_feeRecipient == address(0)) revert InvalidAddress();
        if (_feeRate > MAX_FEE_RATE) revert InvalidFeeRate(_feeRate);

        oracle = AggregatorV3Interface(_oracle);
        feeRate = _feeRate;
        feeRecipient = _feeRecipient;
    }

    // ─── External: User Actions ───────────────────────────────────────────────

    /**
     * @notice Place a bet on the current round
     * @param position UP or DOWN
     */
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

        BetInfo storage betInfo = ledger[epoch][msg.sender];
        betInfo.position = position;
        betInfo.amount = msg.value;
        userRounds[msg.sender].push(epoch);

        emit BetPlaced(epoch, msg.sender, position, msg.value);
    }

    /**
     * @notice Claim winnings for multiple epochs
     * @param epochs Array of epoch numbers to claim
     */
    function claim(uint256[] calldata epochs) external nonReentrant {
        uint256 reward;

        for (uint256 i; i < epochs.length; ) {
            uint256 epoch = epochs[i];
            reward += _calculateReward(epoch, msg.sender);
            unchecked { ++i; }
        }

        if (reward == 0) revert NothingToClaim(0, msg.sender);

        (bool success, ) = payable(msg.sender).call{value: reward}("");
        require(success, "Transfer failed");
    }

    // ─── External: Keeper / Operator Actions ──────────────────────────────────

    /**
     * @notice Start a new round. Called by keeper/operator after genesis.
     */
    function executeRound() external whenNotPaused {
        // Lock previous round and start new one atomically
        require(currentEpoch > 0, "Genesis not started");

        _lockRound(currentEpoch);

        uint256 newEpoch = currentEpoch + 1;
        _startRound(newEpoch);
        currentEpoch = newEpoch;
    }

    /**
     * @notice Resolve the previous round (called after closeTimestamp)
     */
    function resolveRound() external whenNotPaused {
        _resolveRound(currentEpoch - 1);
    }

    /**
     * @notice Start genesis round (one-time bootstrap)
     */
    function genesisStartRound() external onlyOwner whenNotPaused {
        require(currentEpoch == 0, "Already started");
        currentEpoch = 1;
        _startRound(1);
        emit RoundStarted(1, block.timestamp);
    }

    // ─── External: Admin ──────────────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setFeeRate(uint256 _feeRate) external onlyOwner {
        if (_feeRate > MAX_FEE_RATE) revert InvalidFeeRate(_feeRate);
        emit FeeRateUpdated(feeRate, _feeRate);
        feeRate = _feeRate;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        emit FeeRecipientUpdated(feeRecipient, _feeRecipient);
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

    // ─── Views ────────────────────────────────────────────────────────────────

    function getCurrentRound() external view returns (Round memory) {
        return rounds[currentEpoch];
    }

    function getUserRounds(address user) external view returns (uint256[] memory) {
        return userRounds[user];
    }

    function claimable(uint256 epoch, address user) external view returns (bool) {
        BetInfo memory info = ledger[epoch][user];
        Round memory round = rounds[epoch];

        if (!round.oracleCalled || info.amount == 0 || info.claimed) return false;

        // Refund case: both sides have bets (draw not possible with strict price check)
        if (round.upAmount == 0 || round.downAmount == 0) return true;

        if (round.closePrice == round.lockPrice) return true; // No price change: refund

        if (round.closePrice > round.lockPrice && info.position == Position.UP) return true;
        if (round.closePrice < round.lockPrice && info.position == Position.DOWN) return true;

        return false;
    }

    function refundable(uint256 epoch, address user) external view returns (bool) {
        BetInfo memory info = ledger[epoch][user];
        Round memory round = rounds[epoch];
        return (
            !round.oracleCalled &&
            block.timestamp > round.closeTimestamp + BUFFER_SECONDS &&
            info.amount > 0 &&
            !info.claimed
        );
    }

    function getLatestPrice() external view returns (int256 price, uint256 updatedAt) {
        (, price, , updatedAt, ) = oracle.latestRoundData();
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _startRound(uint256 epoch) internal {
        Round storage round = rounds[epoch];
        round.epoch = epoch;
        round.startTimestamp = block.timestamp;
        round.lockTimestamp = block.timestamp + ROUND_DURATION;
        round.closeTimestamp = block.timestamp + (2 * ROUND_DURATION);
        emit RoundStarted(epoch, block.timestamp);
    }

    function _lockRound(uint256 epoch) internal {
        Round storage round = rounds[epoch];
        require(block.timestamp >= round.lockTimestamp, "Too early to lock");
        require(block.timestamp <= round.lockTimestamp + BUFFER_SECONDS, "Lock window expired");

        (uint80 roundId, int256 price) = _getOraclePrice();
        round.lockPrice = price;
        round.lockOracleId = roundId;

        emit RoundLocked(epoch, roundId, price);
    }

    function _resolveRound(uint256 epoch) internal {
        Round storage round = rounds[epoch];
        require(round.lockOracleId != 0, "Round not locked");
        require(block.timestamp >= round.closeTimestamp, "Too early to resolve");
        require(!round.oracleCalled, "Already resolved");

        (uint80 roundId, int256 price) = _getOraclePrice();
        round.closePrice = price;
        round.closeOracleId = roundId;
        round.oracleCalled = true;

        // Determine winner and distribute fees
        Position result;
        if (price > round.lockPrice) {
            result = Position.UP;
        } else if (price < round.lockPrice) {
            result = Position.DOWN;
        }
        // If price == lockPrice: both sides refunded (handled in _calculateReward)

        _distributeRewards(epoch);

        emit RoundResolved(epoch, roundId, price, result);
    }

    function _distributeRewards(uint256 epoch) internal {
        Round storage round = rounds[epoch];
        uint256 total = round.totalAmount;
        uint256 fee = (total * feeRate) / BASIS_POINTS;

        uint256 rewardPool = total - fee;
        treasuryAmount += fee;

        bool upWins = round.closePrice > round.lockPrice;
        bool downWins = round.closePrice < round.lockPrice;

        if (upWins && round.upAmount > 0) {
            round.rewardBaseCalAmount = round.upAmount;
            round.rewardAmount = rewardPool;
        } else if (downWins && round.downAmount > 0) {
            round.rewardBaseCalAmount = round.downAmount;
            round.rewardAmount = rewardPool;
        } else {
            // Draw or one side empty: full refund, no fee taken
            treasuryAmount -= fee;
            round.rewardBaseCalAmount = total;
            round.rewardAmount = total;
        }
    }

    function _calculateReward(uint256 epoch, address user) internal returns (uint256 reward) {
        Round storage round = rounds[epoch];
        BetInfo storage info = ledger[epoch][user];

        if (info.amount == 0 || info.claimed) return 0;
        if (!round.oracleCalled) {
            // Allow refund if oracle never called past buffer
            if (block.timestamp <= round.closeTimestamp + BUFFER_SECONDS) return 0;
            info.claimed = true;
            return info.amount;
        }

        bool upWins = round.closePrice > round.lockPrice;
        bool downWins = round.closePrice < round.lockPrice;
        bool draw = round.closePrice == round.lockPrice;
        bool oneEmpty = round.upAmount == 0 || round.downAmount == 0;

        bool isWinner = (upWins && info.position == Position.UP) ||
                        (downWins && info.position == Position.DOWN);

        if (draw || oneEmpty) {
            // Refund
            info.claimed = true;
            return info.amount;
        }

        if (!isWinner) return 0;

        info.claimed = true;
        reward = (info.amount * round.rewardAmount) / round.rewardBaseCalAmount;
    }

    function _isBettable(uint256 epoch) internal view returns (bool) {
        Round memory round = rounds[epoch];
        return (
            round.startTimestamp != 0 &&
            round.lockTimestamp != 0 &&
            block.timestamp >= round.startTimestamp &&
            block.timestamp < round.lockTimestamp
        );
    }

    function _getOraclePrice() internal view returns (uint80 roundId, int256 price) {
        uint256 updatedAt;
        uint80 answeredInRound;

        (roundId, price, , updatedAt, answeredInRound) = oracle.latestRoundData();

        if (price <= 0) revert InvalidOracle();
        if (updatedAt == 0) revert OracleDataStale();
        if (answeredInRound < roundId) revert OracleDataStale();
        // Require data fresher than 1 hour
        if (block.timestamp - updatedAt > 1 hours) revert OracleDataStale();
    }

    // ─── Receive ──────────────────────────────────────────────────────────────

    receive() external payable {
        revert("Use bet()");
    }
}
