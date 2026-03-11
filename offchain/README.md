# AI Oracle Backend for RWA on Mantle

Complete AI oracle system that monitors the Mantle blockchain and coordinates 3 AI agents to verify real-world assets.

## Architecture

```
offchain/
├── src/
│   ├── index.ts            # Main entry point
│   ├── listener.ts         # Blockchain event listener
│   ├── orchestrator.ts     # AI coordination
│   ├── consensus.ts        # Consensus aggregation
│   ├── submitter.ts        # Submit results to chain
│   ├── test-agents.js      # Test script
│   └── utils/
│       └── logger.ts       # Logging utility
├── agent1.py               # Groq (Llama-3.3-70B)
├── agent2.py               # OpenRouter Agent
├── agent3.py               # Google Gemini 2.0 Flash
├── satellite_service.py    # Google Earth Engine
├── package.json
└── tsconfig.json
```

## How It Works

1. **Listener** watches Mantle blockchain for `VerificationRequested` events
2. **Orchestrator** coordinates the pipeline:
   - Calls `satellite_service.py` to fetch satellite data
   - Calls all 3 agents (`agent1.py`, `agent2.py`, `agent3.py`) **in parallel**
   - Agents analyze independently and return valuations
3. **Consensus Engine** aggregates responses:
   - Calculates weighted average by confidence
   - Detects outliers
   - Computes consensus score
4. **Submitter** uploads evidence to IPFS and submits result to blockchain

## Complete Flow

```
User submits asset in frontend
           ↓
Smart contract emits VerificationRequested event
           ↓
Oracle Listener detects event
           ↓
Orchestrator fetches satellite data (Python)
           ↓
Orchestrator runs 3 AI agents in parallel (Python)
    ├── Agent 1 (Groq)
    ├── Agent 2 (OpenRouter)
    └── Agent 3 (Gemini)
           ↓
Consensus Engine aggregates results
           ↓
Submitter uploads evidence to IPFS
           ↓
Submitter calls submitVerification on chain
           ↓
Frontend shows verification result
```

## Setup

### 1. Install Dependencies

```bash
cd offchain
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required variables:
- `MANTLE_RPC_URL` - Mantle RPC endpoint
- `ORACLE_PRIVATE_KEY` - Your oracle wallet private key (with ETH for gas)
- `GROQ_API_KEY` - Get free at https://console.groq.com
- `GOOGLE_GEMINI_API_KEY` - Get free at https://makersuite.google.com/app/apikey
- `OPENROUTER_API_KEY` - OpenRouter API credentials
- `GOOGLE_EARTH_ENGINE_PROJECT_ID` - Your GEE project ID
- Contract addresses (already deployed)

### 3. Get Free API Keys

#### Groq (Free - 30 req/min)
1. Visit https://console.groq.com
2. Sign up with GitHub/Google
3. Go to API Keys → Create
4. Copy key to `.env`

#### Google Gemini (Free - 15 RPM)
1. Visit https://makersuite.google.com/app/apikey
2. Sign in with Google account
3. Create API Key
4. Copy to `.env`

#### OpenRouter
Get your API key from https://openrouter.ai/

### 4. Install Node.js Dependencies

```bash
npm install
```

### 5. Test Everything

Test all agents and satellite service:

```bash
npm test
```

This runs all 3 agents in parallel and shows consensus calculation.

### 6. Run the Oracle

Start listening for blockchain events:

```bash
npm run dev
```

The oracle will now:
- Monitor Mantle blockchain for verification requests
- Automatically process requests through AI pipeline
- Submit results back to chain

## Agent Output Format

All agents return JSON in this format:

```json
{
  "valuation": 485000,
  "Testing with Frontend

When you submit an asset through the frontend:

1. Frontend calls `oracleRouter.requestVerification()`
2. Smart contract emits `VerificationRequested` event
3. Oracle listener detects the event
4. Pipeline executes:
   - Fetch satellite data
   - Run 3 AI agents in parallel
   - Calculate consensus
   - Submit result to blockchain
5. Frontend displays verification result

## Expected Output

```
🚨 NEW VERIFICATION REQUEST DETECTED
📝 Request ID: 0x123...
📍 Location: 40.7128, -74.0060

🔄 Starting AI analysis pipeline...

📡 Step 1: Fetching satellite imagery...
✅ Satellite data: 200 sqm, NDVI 0.65

🤖 Step 2: Running 3 AI agents in parallel...
✅ Agent 1 (groq): $485,000 (88% confidence)
✅ Agent 2 (openrouter): $465,000 (84% confidence)
✅ Agent 3 (gemini): $475,000 (90% confidence)

🔮 Step 3: Calculating consensus...
✅ Consensus reached: $475,000
   Final confidence: 87%
   Consensus score: 95/100

⛓️  Step 4: Submitting to blockchain...
✅ Transaction submitted: 0xabc...

✅ REQUEST COMPLETED IN 12.5s
```

## Troubleshooting

**"Missing required environment variables":**
- Copy `.env.example` to `.env` and fill in all values

**"Python script failed":**
- Make sure Python is installed: `python --version`
- Install Python dependencies: `pip install -r requirements.txt`

**"Permission denied" on Earth Engine:**
- Enable Earth Engine API in Google Cloud Console
- Wait 5-10 minutes for permissions to propagate

**"Transaction failed":**
- Make sure oracle wallet has MNT for gas fees
- Check that contract addresses are correct