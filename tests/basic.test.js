// Simple test to verify that our refactored code structure is working

import { strict as assert } from 'assert';
import { createASRConnection } from '../backend/services/asr.js';
import { qwenChat } from '../backend/services/chat.js';
import config from '../backend/config/appConfig.js';

async function runTests() {
  console.log('🧪 Running basic tests...\n');

  // Test 1: Configuration loading
  console.log('✅ Test 1: Checking configuration...');
  assert(typeof config.port === 'number', 'Port should be a number');
  assert(typeof config.dashscope.apiKey === 'string' || config.dashscope.apiKey === undefined, 'API key should be string or undefined');
  console.log('   Configuration loaded correctly\n');

  // Test 2: Service imports
  console.log('✅ Test 2: Checking service imports...');
  assert(typeof createASRConnection === 'function', 'createASRConnection should be a function');
  assert(typeof qwenChat === 'function', 'qwenChat should be a function');
  console.log('   Services imported correctly\n');

  // Test 3: Configuration settings
  console.log('✅ Test 3: Checking safety configurations...');
  assert(typeof config.safety.maxResponseLength === 'number', 'Max response length should be a number');
  assert(Array.isArray(config.safety.allowedTopics), 'Allowed topics should be an array');
  console.log('   Safety configurations are set\n');

  console.log('🎉 All tests passed!');
  console.log('\n📋 Next steps:');
  console.log('   1. Set your DASHSCOPE_API_KEY in .env file');
  console.log('   2. Run "npm run dev" to start the application');
  console.log('   3. Visit http://localhost:8000 to use the application');
}

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}

export { runTests };