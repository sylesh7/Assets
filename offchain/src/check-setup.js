/**
 * Setup Checker
 * Validates that all dependencies and configuration are correct
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════════');
console.log('🔍 RWA ORACLE SETUP CHECKER');
console.log('═══════════════════════════════════════════════════════════════\n');

let allGood = true;

// Check 1: .env file exists
console.log('1️⃣ Checking .env file...');
if (!fs.existsSync('.env')) {
  console.log('   ❌ .env file not found');
  console.log('   → Run: cp .env.example .env');
  allGood = false;
} else {
  console.log('   ✅ .env file exists');
  
  // Check required variables
  const envContent = fs.readFileSync('.env', 'utf8');
  const requiredVars = [
    'ORACLE_ROUTER_ADDRESS',
    'CONSENSUS_ENGINE_ADDRESS',
    'ORACLE_PRIVATE_KEY',
    'GROQ_API_KEY',
    'GOOGLE_GEMINI_API_KEY',
    'GOOGLE_EARTH_ENGINE_PROJECT_ID'
  ];
  
  const missingVars = requiredVars.filter(v => {
    const regex = new RegExp(`${v}=(.+)`);
    const match = envContent.match(regex);
    return !match || match[1].includes('your_') || match[1].trim() === '';
  });
  
  if (missingVars.length > 0) {
    console.log('   ⚠️  Missing or incomplete variables:');
    missingVars.forEach(v => console.log(`      - ${v}`));
    allGood = false;
  } else {
    console.log('   ✅ All required variables set');
  }
}

// Check 2: Node modules
console.log('\n2️⃣ Checking Node.js dependencies...');
if (!fs.existsSync('node_modules')) {
  console.log('   ❌ node_modules not found');
  console.log('   → Run: npm install');
  allGood = false;
} else {
  console.log('   ✅ Node.js dependencies installed');
}

// Check 3: Python
console.log('\n3️⃣ Checking Python...');
const pythonCheck = spawn('python', ['--version']);
pythonCheck.on('error', () => {
  console.log('   ❌ Python not found');
  console.log('   → Install Python 3.8+ from https://python.org');
  allGood = false;
});
pythonCheck.stdout.on('data', (data) => {
  console.log(`   ✅ ${data.toString().trim()}`);
});

// Check 4: Python packages
console.log('\n4️⃣ Checking Python packages...');
const pipCheck = spawn('pip', ['list']);
let pipOutput = '';
pipCheck.stdout.on('data', (data) => {
  pipOutput += data.toString();
});
pipCheck.on('close', () => {
  const requiredPackages = ['groq', 'google-generativeai', 'earthengine-api', 'python-dotenv'];
  const installed = requiredPackages.filter(pkg => pipOutput.includes(pkg));
  
  if (installed.length === requiredPackages.length) {
    console.log('   ✅ All Python packages installed');
  } else {
    const missing = requiredPackages.filter(pkg => !pipOutput.includes(pkg));
    console.log('   ⚠️  Missing Python packages:');
    missing.forEach(pkg => console.log(`      - ${pkg}`));
    console.log('   → Run: pip install -r requirements.txt');
    allGood = false;
  }
  
  // Check 5: Python scripts exist
  console.log('\n5️⃣ Checking Python agent files...');
  const pythonFiles = ['agent1.py', 'agent2.py', 'agent3.py', 'satellite_service.py'];
  const missingFiles = pythonFiles.filter(f => !fs.existsSync(f));
  
  if (missingFiles.length > 0) {
    console.log('   ❌ Missing Python files:');
    missingFiles.forEach(f => console.log(`      - ${f}`));
    allGood = false;
  } else {
    console.log('   ✅ All Python agent files present');
  }
  
  // Check 6: TypeScript files
  console.log('\n6️⃣ Checking TypeScript backend files...');
  const tsFiles = [
    'src/index.ts',
    'src/listener.ts',
    'src/orchestrator.ts',
    'src/consensus.ts',
    'src/submitter.ts'
  ];
  const missingTsFiles = tsFiles.filter(f => !fs.existsSync(f));
  
  if (missingTsFiles.length > 0) {
    console.log('   ❌ Missing TypeScript files:');
    missingTsFiles.forEach(f => console.log(`      - ${f}`));
    allGood = false;
  } else {
    console.log('   ✅ All TypeScript backend files present');
  }
  
  // Final summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  if (allGood) {
    console.log('✅ SETUP COMPLETE - Ready to run!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n📋 Next steps:');
    console.log('   1. Test agents: npm test');
    console.log('   2. Start oracle: npm run dev');
    console.log('   3. Submit asset from frontend');
    console.log('   4. Watch the magic happen! ✨\n');
  } else {
    console.log('⚠️  SETUP INCOMPLETE - Fix issues above');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n📋 To complete setup:');
    console.log('   1. Create .env from .env.example');
    console.log('   2. Fill in all API keys');
    console.log('   3. Run: npm install');
    console.log('   4. Run: pip install -r requirements.txt');
    console.log('   5. Run this checker again\n');
  }
});
