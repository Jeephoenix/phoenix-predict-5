# Phoenix Predict 5

Decentralized 5-minute BTC/USD prediction market on Base. Built with Solidity, Hardhat, Chainlink, Next.js, and Wagmi.

---

## Project Structure

```
phoenix-predict-5/
├── contracts/
│   ├── PhoenixPredict5.sol        # Main prediction market contract
│   └── test/
│       └── MockV3Aggregator.sol   # Chainlink oracle mock (tests only)
├── scripts/
│   └── deploy.ts                  # Deployment script (Base Sepolia + Mainnet)
├── test/
│   └── PhoenixPredict5.test.ts    # Full unit test suite
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx         # Root layout with font + providers
│   │   │   ├── page.tsx           # Main page
│   │   │   └── providers.tsx      # Wagmi + RainbowKit providers
│   │   ├── components/
│   │   │   ├── PredictionCard.tsx # Bet UP/DOWN card
│   │   │   └── ClaimPanel.tsx     # Claim rewards panel
│   │   ├── hooks/
│   │   │   ├── useRound.ts        # Round data + price hooks
│   │   │   └── useCountdown.ts    # Countdown timer hook
│   │   ├── utils/
│   │   │   ├── contract.ts        # ABI + contract address
│   │   │   └── wagmi.ts           # Wagmi config + wallet connectors
│   │   └── styles/
│   │       └── globals.css        # Dark theme, monospace UI
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── package.json
│   └── .env.local.example
├── hardhat.config.ts
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Contracts — Local Setup

### 1. Install dependencies

```bash
cd phoenix-predict-5
npm install
```

### 2. Compile contracts

```bash
npm run compile
```

### 3. Run tests

```bash
npm run test
```

### 4. Run tests with gas report

```bash
npm run test:gas
```

---

## Deploy to Base Sepolia (Testnet)

### 1. Copy and fill in environment variables

```bash
cp .env.example .env
```

Fill in `.env`:
- `PRIVATE_KEY` — Wallet private key (no funds needed on testnet, get test ETH from https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
- `BASE_SEPOLIA_RPC_URL` — e.g. `https://sepolia.base.org` or an Alchemy/Infura endpoint
- `BASESCAN_API_KEY` — Get from https://basescan.org/register
- `FEE_RECIPIENT` — Address that collects protocol fees

### 2. Deploy

```bash
npm run deploy:sepolia
```

The script will:
1. Deploy `PhoenixPredict5` with Chainlink BTC/USD feed for Base Sepolia
2. Verify the contract on Basescan automatically

### 3. Bootstrap the market

After deployment, call `genesisStartRound()` once from the owner wallet:

```bash
npx hardhat console --network base-sepolia
> const c = await ethers.getContractAt("PhoenixPredict5", "0xYourAddress")
> await c.genesisStartRound()
```

### 4. Set up a keeper

You need a keeper to call `executeRound()` and `resolveRound()` every 5 minutes. Options:
- [Chainlink Automation](https://automation.chain.link/) (recommended for production)
- Simple Node.js cron script
- Gelato Network

---

## Deploy to Base Mainnet

> ⚠️ Read all security considerations below before deploying to mainnet.

```bash
npm run deploy:mainnet
```

Ensure `.env` has `PRIVATE_KEY`, `BASE_RPC_URL`, `BASESCAN_API_KEY`, `FEE_RECIPIENT`, `OWNER_ADDRESS`.

---

## Frontend Setup

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in:
- `NEXT_PUBLIC_CONTRACT_ADDRESS` — Your deployed contract address
- `NEXT_PUBLIC_CHAIN_ID` — `8453` (mainnet) or `84532` (testnet)
- `NEXT_PUBLIC_WALLETCONNECT_ID` — Get from https://cloud.walletconnect.com

### 3. Run dev server

```bash
npm run dev
```

### 4. Build for production

```bash
npm run build
npm run start
```

---

## Step-by-Step GitHub Commit Instructions

```bash
# 1. Initialize repo
cd phoenix-predict-5
git init
git branch -M main

# 2. Add remote (create repo on GitHub first)
git remote add origin https://github.com/YOUR_USERNAME/phoenix-predict-5.git

# 3. Stage contracts
git add contracts/PhoenixPredict5.sol
git commit -m "feat: add PhoenixPredict5 smart contract"

# 4. Stage test mock
git add contracts/test/MockV3Aggregator.sol
git commit -m "feat: add MockV3Aggregator for testing"

# 5. Stage Hardhat config
git add hardhat.config.ts tsconfig.json package.json
git commit -m "chore: add Hardhat config and TypeScript setup"

# 6. Stage deploy script
git add scripts/deploy.ts
git commit -m "feat: add Base deployment script with Basescan verification"

# 7. Stage tests
git add test/PhoenixPredict5.test.ts
git commit -m "test: add full unit test suite for PhoenixPredict5"

# 8. Stage environment files
git add .env.example .gitignore
git commit -m "chore: add .env.example and .gitignore"

# 9. Stage frontend
git add frontend/
git commit -m "feat: add Next.js frontend with Wagmi, RainbowKit, and dark UI"

# 10. Stage README
git add README.md
git commit -m "docs: add full README with setup and deployment instructions"

# 11. Push
git push -u origin main
```

---

## Security Considerations Before Mainnet

### Smart Contract
- ✅ ReentrancyGuard on all state-changing external functions
- ✅ Chainlink oracle staleness check (1 hour max age, answeredInRound validation)
- ✅ No admin price control — resolution is 100% on-chain via Chainlink
- ✅ Fee capped at 10% in contract (cannot be raised beyond that)
- ✅ Custom errors save gas and aid debugging
- ✅ Refund logic when one side is empty or price doesn't move
- ✅ `receive()` reverts to prevent accidental ETH sends
- ✅ Pausable for emergency response
- ✅ `viaIR` optimizer enabled for better gas efficiency

### Before Mainnet Checklist
- [ ] Get a professional smart contract audit (e.g., OpenZeppelin, Code4rena, Sherlock)
- [ ] Deploy and test on Base Sepolia for at least 1 week
- [ ] Set up Chainlink Automation for the keeper (not a manual wallet)
- [ ] Set `OWNER_ADDRESS` to a multisig (Gnosis Safe recommended)
- [ ] Set `FEE_RECIPIENT` to a separate wallet from the owner
- [ ] Monitor oracle health — consider a fallback in case Chainlink feed goes stale
- [ ] Set initial `feeRate` conservatively (200 bps = 2%)
- [ ] Have an incident response plan and know how to call `pause()`

### Known Design Decisions
- Single bet per address per round (prevents spam, simplifies accounting)
- 30-second buffer on lock/resolve to handle block time variance
- Draw (price unchanged) results in full refund with no fee taken
- Treasury can only be claimed by `feeRecipient`, never by owner

---

## Chainlink Oracle Addresses

| Network | Address |
|---|---|
| Base Mainnet | `0x64c911996D3c6aC71f9b455B1E8E7266BcfBB8E3` |
| Base Sepolia | `0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298` |

Source: https://docs.chain.link/data-feeds/price-feeds/addresses?network=base

---

## Supported Wallets

- Coinbase Wallet (Base app)
- Rabby Wallet
- OKX Wallet
- MetaMask
