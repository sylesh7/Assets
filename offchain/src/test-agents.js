/**
 * Test script for AI agents
 * Tests all 3 agents and satellite service with mock data
 */
const { spawn } = require('child_process');
const path = require('path');

async function testPythonScript(scriptName, inputData, agentName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 Testing ${agentName}...`);
    
    const python = spawn('python', [path.join(__dirname, '..', scriptName)]);
    
    let dataString = '';
    let errorString = '';
    
    python.stdout.on('data', (data) => {
      dataString += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorString += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ ${agentName} failed: ${errorString}`);
        reject(new Error(errorString));
      } else {
        try {
          const result = JSON.parse(dataString);
          console.log(`✅ ${agentName} response:`);
          console.log(`   Valuation: $${result.valuation?.toLocaleString() || 'N/A'}`);
          console.log(`   Confidence: ${result.confidence || 0}%`);
          console.log(`   Agent: ${result.agent}`);
          if (result.error) {
            console.log(`   Error: ${result.error}`);
          }
          resolve(result);
        } catch (e) {
          console.error(`❌ Failed to parse ${agentName} response:`, dataString);
          reject(e);
        }
      }
    });
    
    python.stdin.write(JSON.stringify(inputData));
    python.stdin.end();
    
    setTimeout(() => {
      python.kill();
      reject(new Error(`${agentName} timeout`));
    }, 30000);
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 TESTING AI AGENTS');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Test data
  const mockData = {
    request_id: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    latitude: 40.7128,
    longitude: -74.0060,
    satellite_data: {
      area_sqm: 200,
      ndvi: 0.65,
      cloud_coverage: 5,
      resolution_meters: 10
    },
    document_count: 2,
    document_hashes: ['QmTest1', 'QmTest2']
  };
  
  try {
    // Test satellite service
    console.log('\n📡 Testing Satellite Service...');
    const satelliteData = await testPythonScript(
      'satellite_service.py',
      { latitude: mockData.latitude, longitude: mockData.longitude },
      'Satellite Service'
    );
    
    // Test all 3 agents in parallel
    console.log('\n🤖 Testing AI Agents in Parallel...');
    const [agent1, agent2, agent3] = await Promise.allSettled([
      testPythonScript('agent1.py', mockData, 'Agent 1 (Groq)'),
      testPythonScript('agent2.py', mockData, 'Agent 2 (OpenRouter)'),
      testPythonScript('agent3.py', mockData, 'Agent 3 (Llama 3.1)')
    ]);
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Satellite Service: ${satelliteData ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Agent 1 (Groq): ${agent1.status === 'fulfilled' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Agent 2 (OpenRouter): ${agent2.status === 'fulfilled' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Agent 3 (Llama): ${agent3.status === 'fulfilled' ? '✅ PASS' : '❌ FAIL'}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    if (agent1.status === 'fulfilled' && agent2.status === 'fulfilled' && agent3.status === 'fulfilled') {
      const valuations = [
        agent1.value.valuation,
        agent2.value.valuation,
        agent3.value.valuation
      ];
      const avg = valuations.reduce((a, b) => a + b, 0) / valuations.length;
      console.log('🔮 Consensus Calculation:');
      console.log(`   Average valuation: $${Math.round(avg).toLocaleString()}`);
      console.log(`   Min: $${Math.min(...valuations).toLocaleString()}`);
      console.log(`   Max: $${Math.max(...valuations).toLocaleString()}`);
      console.log(`   Spread: $${(Math.max(...valuations) - Math.min(...valuations)).toLocaleString()}\n`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

main();
