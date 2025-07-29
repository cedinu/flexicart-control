const { autoScanVtrs, getVtrStatus, VTR_PORTS, humanizeStatus, sendCommand } = require('../src/commands/vtr_interface');

// Import transport functions
const {
  playVtr,
  pauseVtr,
  stopVtr,
  recordVtr,
  fastForwardVtr,
  rewindVtr,
  ejectTape,
  jogForward,
  jogReverse,
  jogForwardFast,
  jogReverseFast,
  jogStill,
  shuttlePlus1,
  shuttleMinus1,
  testVtrTransportCommands,
  batchControlVtrs,
  sendVtrTransportCommand,
  interpretVtrResponse,
  getStoredTransportState,
  storeTransportState,
  clearTransportState,
  VTR_TRANSPORT_COMMANDS,
  VtrTransportError
} = require('../src/commands/vtr_cmds_transport');

// Import status functions
const {
  getDeviceType,
  getExtendedStatus,
  getVtrStatusNonDestructive,
  checkSingleVtr,
  checkSingleVtrEnhanced,
  debugStatusResponses,
  testCommunication,
  testNoTapeCommands,
  testAlternativeCommands,
  testExtendedStatus,
  checkTapeStatus,
  establishRemoteControl,
  monitorVtr,
  analyzeResponse,
  decodeVtrStatusResponse,
  interpretVtrStatusResponse,
  getCommandBuffer,
  detectVtrModel,        // ✅ Add this
  testCommandSupport,    // ✅ Add this
  VTR_STATUS_COMMANDS,
  DEVICE_TYPES,
  VTR_STATUS_PATTERNS,
  VtrStatusError
} = require('../src/commands/vtr_cmds_status');

// Import timecode functions that are missing
const {
  testAllTimecodeCommands,
  testTimecodeAdvancement,
  getDetailedTimecode,
  testTapeTimecodeCommands,
  testRealTapeTimecode,
  monitorTimecode,
  checkTapeMovement
} = require('./check_vtr_timecode');

// Helper functions (keep these in test file)
function calculateChecksum(commandBytes) {
  let checksum = 0;
  for (let i = 0; i < commandBytes.length; i++) {
    checksum ^= commandBytes[i];
  }
  return checksum;
}

function createSonyCommand(cmdBytes) {
  const checksum = calculateChecksum(Buffer.from(cmdBytes));
  return Buffer.from([...cmdBytes, checksum]);
}

function verifyChecksum(command) {
  if (command.length < 2) return false;
  
  const commandBytes = command.slice(0, -1);
  const providedChecksum = command[command.length - 1];
  const calculatedChecksum = calculateChecksum(commandBytes);
  
  return providedChecksum === calculatedChecksum;
}

// Update sendVtrCommand to use the transport module
async function sendVtrCommand(path, command, commandName) {
  return await sendVtrTransportCommand(path, command, commandName);
}

/**
 * Send raw command to VTR with proper error handling
 * @param {string} path - VTR port path
 * @param {string} hexCommand - Hex command string
 */
async function sendRawCommand(path, hexCommand) {
  console.log(`🔧 Sending raw command: ${hexCommand} to ${path}`);
  
  try {
    // Parse hex string to buffer
    const bytes = hexCommand.split(' ').map(hex => parseInt(hex, 16));
    const command = Buffer.from(bytes);
    
    console.log(`📤 Command bytes: ${command.toString('hex')}`);
    console.log(`📤 Command length: ${command.length} bytes`);
    
    const response = await sendCommand(path, command, 3000);
    
    if (response && response.length > 0) {
      const hex = response.toString('hex');
      console.log(`📥 Response: ${hex} (${response.length} bytes)`);
      analyzeResponse(response, 'Raw Command');
    } else {
      console.log('❌ No response received');
    }
    
  } catch (error) {
    console.log(`❌ Raw command failed: ${error.message}`);
  }
}

/**
 * Diagnostic check function
 * @param {string} path - VTR port path
 */
async function diagnosticCheck(path) {
  console.log(`🔍 Running diagnostic check on ${path}...`);
  
  try {
    // Test basic communication
    await testCommunication(path);
    
    // Check status
    await checkSingleVtrEnhanced(path);
    
    console.log('✅ Diagnostic check complete');
  } catch (error) {
    console.log(`❌ Diagnostic check failed: ${error.message}`);
  }
}

/**
 * Scan all VTR ports
 */
async function scanAllVtrs() {
  console.log('🔍 Scanning for VTRs on all ports...');
  const results = await autoScanVtrs();
  
  if (results.length === 0) {
    console.log('❌ No VTRs found');
  } else {
    console.log(`✅ Found ${results.length} VTR(s):`);
    results.forEach(vtr => {
      console.log(`   📼 ${vtr.port}: ${vtr.mode.toUpperCase()} - TC: ${vtr.timecode}`);
    });
  }
  
  return results;
}

/**
 * Test VTR commands
 */
async function testVtrCommands(path) {
  console.log(`🧪 Testing VTR transport commands on ${path}...`);
  console.log('⚠️  Note: Skipping PAUSE (not supported on standard HDW)');
  
  const commands = [
    { name: 'STOP', func: () => stopVtr(path) },
    { name: 'PLAY', func: () => playVtr(path) },
    { name: 'FAST FORWARD', func: () => fastForwardVtr(path) },
    { name: 'REWIND', func: () => rewindVtr(path) },
    { name: 'STOP', func: () => stopVtr(path) }  // End with STOP
  ];
  
  for (const cmd of commands) {
    try {
      console.log(`📤 Testing ${cmd.name}...`);
      await cmd.func();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between commands
    } catch (error) {
      console.log(`❌ ${cmd.name} failed: ${error.message}`);
    }
  }
}

/**
 * Interactive VTR control function
 * @param {string} path - VTR port path
 */
async function controlVtr(path) {
  console.log(`🎛️ Interactive VTR Control for ${path}`);
  console.log('=====================================');
  console.log('Commands: play, stop, ff, rew, jog-fwd, jog-rev, jog-still, eject, status, debug-status, tc-test, tc-movement, tc-detailed, tc-tape, tc-real, quit');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'VTR> '
  });
  
  rl.prompt();
  
  rl.on('line', async (input) => {
    const command = input.trim().toLowerCase();
    
    try {
      switch (command) {
        // Transport commands
        case 'play':
          await playVtr(path);
          break;
        case 'stop':
          await stopVtr(path);
          break;
        case 'ff':
        case 'fast-forward':
          await fastForwardVtr(path);
          break;
        case 'rew':
        case 'rewind':
          await rewindVtr(path);
          break;
        case 'jog-fwd':
          await jogForward(path);
          break;
        case 'jog-rev':
          await jogReverse(path);
          break;
        case 'jog-still':
          await jogStill(path);
          break;
        case 'eject':
          await ejectTape(path);
          break;
          
        // Status commands
        case 'status':
          await checkSingleVtrEnhanced(path);
          break;
        case 'debug-status':
          await debugStatusResponses(path);
          break;
          
        // Timecode commands (using imported functions)
        case 'tc-test':
          await testAllTimecodeCommands(path);
          break;
        case 'tc-movement':
          await testTimecodeAdvancement(path);
          break;
        case 'tc-detailed':
          await getDetailedTimecode(path);
          break;
        case 'tc-tape':
          await testTapeTimecodeCommands(path);
          break;
        case 'tc-real':
          const realSources = await testRealTapeTimecode(path);
          if (realSources.length > 0) {
            console.log('\n🎯 REAL TAPE TIMECODE SOURCES FOUND:');
            realSources.forEach(source => {
              console.log(`🎯 ${source.name} (${source.command}) - Use this for real tape timecode!`);
            });
          }
          break;
        case 'tc-monitor':
          await monitorTimecode(path, 1000);
          break;
        case 'tape-movement':
          const moved = await checkTapeMovement(path);
          console.log(`📊 Tape movement detected: ${moved ? '✅ YES' : '❌ NO'}`);
          break;
          
        case 'quit':
        case 'exit':
          console.log('👋 Goodbye!');
          rl.close();
          return;
          
        default:
          console.log('❌ Unknown command. Available: play, stop, ff, rew, jog-fwd, jog-rev, jog-still, eject, status, debug-status, tc-test, tc-movement, tc-detailed, tc-tape, tc-real, tc-monitor, tape-movement, quit');
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    rl.prompt();
  });
  
  rl.on('close', () => {
    console.log('\n👋 VTR control session ended');
    process.exit(0);
  });
}

// Update module exports to only include test-specific functions
module.exports = {
  // Test-specific functions only
  scanAllVtrs,
  testVtrCommands,
  calculateChecksum,
  createSonyCommand,
  verifyChecksum,
  sendVtrCommand,
  controlVtr,
  
  // Don't re-export everything - causes conflicts
  // Just export what this module specifically provides
};

// ===== MAIN EXECUTION BLOCK =====
/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Show header for all commands
  console.log('🎬 VTR Status Checker & Controller');
  console.log('==================================');
  
  // Show help if no arguments
  if (args.length === 0) {
    console.log('🎛️ VTR Control System');
    console.log('===================');
    console.log('\nUsage:');
    console.log('  node check_vtr_status.js --scan                    # Scan for VTRs');
    console.log('  node check_vtr_status.js --control <port>          # Interactive control');
    console.log('  node check_vtr_status.js --test <port>             # Test commands');
    console.log('  node check_vtr_status.js --status <port>           # Check status');
    console.log('  node check_vtr_status.js --model <port>            # Detect VTR model');
    console.log('  node check_vtr_status.js --timecode <port>         # Test timecode');
    console.log('  node check_vtr_status.js --raw <port> <hex_cmd>    # Send raw command');
    console.log('\nExamples:');
    console.log('  node check_vtr_status.js --scan');
    console.log('  node check_vtr_status.js --control /dev/ttyRP11');
    console.log('  node check_vtr_status.js --model /dev/ttyRP11');
    console.log('  node check_vtr_status.js --raw /dev/ttyRP11 "20 01 21"');
    console.log('\n📋 Available VTR ports:');
    VTR_PORTS.forEach(port => {
      console.log(`  📼 ${port}`);
    });
    return;
  }
  
  const command = args[0];
  const vtrPath = args[1];
  
  try {
    switch (command) {
      case '--scan':
        console.log('🔍 Scanning for VTRs...');
        await scanAllVtrs();
        break;
        
      case '--model':
        if (!vtrPath) {
          console.log('❌ Error: Port path required for model detection');
          console.log('Usage: node check_vtr_status.js --model <port>');
          return;
        }
        console.log(`🔍 Detecting VTR model at ${vtrPath}...`);
        await detectVtrModel(vtrPath);
        break;
        
      case '--status':
        if (!vtrPath) {
          console.log('❌ Error: Port path required for status check');
          console.log('Usage: node check_vtr_status.js --status <port>');
          return;
        }
        console.log(`📊 Checking status of VTR at ${vtrPath}...`);
        
        // Show model info first when checking status
        const modelInfo = await detectVtrModel(vtrPath);
        console.log(''); // Separator
        await checkSingleVtrEnhanced(vtrPath);
        break;
        
      case '--test':
        if (!vtrPath) {
          console.log('❌ Error: Port path required for test mode');
          console.log('Usage: node check_vtr_status.js --test <port>');
          return;
        }
        console.log(`🧪 Testing VTR at ${vtrPath}...`);
        await diagnosticCheck(vtrPath);
        break;
        
      case '--control':
        if (!vtrPath) {
          console.log('❌ Error: Port path required for control mode');
          console.log('Usage: node check_vtr_status.js --control <port>');
          return;
        }
        console.log(`🎛️ Starting interactive control for ${vtrPath}...`);
        await controlVtr(vtrPath);
        break;
        
      case '--timecode':
        if (!vtrPath) {
          console.log('❌ Error: Port path required for timecode test');
          console.log('Usage: node check_vtr_status.js --timecode <port>');
          return;
        }
        console.log(`🕐 Testing timecode on VTR at ${vtrPath}...`);
        await testAllTimecodeCommands(vtrPath);
        break;
        
      case '--raw':
        if (!vtrPath || !args[2]) {
          console.log('❌ Error: Port path and hex command required for raw mode');
          console.log('Usage: node check_vtr_status.js --raw <port> "<hex_command>"');
          console.log('Example: node check_vtr_status.js --raw /dev/ttyRP11 "20 01 21"');
          return;
        }
        const hexCommand = args[2];
        console.log(`🔧 Sending raw command to VTR at ${vtrPath}...`);
        await sendRawCommand(vtrPath, hexCommand);
        break;
        
      case '--debug':
        if (!vtrPath) {
          console.log('❌ Error: Port path required for debug mode');
          console.log('Usage: node check_vtr_status.js --debug <port>');
          return;
        }
        console.log(`🔍 Debug analysis of VTR at ${vtrPath}...`);
        await debugStatusResponses(vtrPath);
        break;
        
      case '--tape-tc':
        if (!vtrPath) {
          console.log('❌ Error: Port path required for tape timecode test');
          console.log('Usage: node check_vtr_status.js --tape-tc <port>');
          return;
        }
        console.log(`🎬 Testing tape timecode on VTR at ${vtrPath}...`);
        await testTapeTimecodeCommands(vtrPath);
        break;
        
      case '--real-tc':
        if (!vtrPath) {
          console.log('❌ Error: Port path required for real timecode test');
          console.log('Usage: node check_vtr_status.js --real-tc <port>');
          return;
        }
        console.log(`🎯 Finding real tape timecode on VTR at ${vtrPath}...`);
        const realSources = await testRealTapeTimecode(vtrPath);
        if (realSources.length > 0) {
          console.log('\n🎯 REAL TAPE TIMECODE SOURCES FOUND:');
          realSources.forEach(source => {
            console.log(`🎯 ${source.name} (${source.command}) - Use this for real tape timecode!`);
          });
        }
        break;
        
      case '--help':
      case '-h':
        console.log('🎛️ VTR Control System - Help');
        console.log('===========================');
        console.log('\nAvailable Commands:');
        console.log('  --scan                 Scan for VTRs on all ports');
        console.log('  --model <port>         Detect exact VTR model and capabilities');
        console.log('  --control <port>       Interactive VTR control');
        console.log('  --test <port>          Run diagnostic tests');
        console.log('  --status <port>        Check VTR status (includes model detection)');
        console.log('  --timecode <port>      Test timecode commands');
        console.log('  --debug <port>         Debug status responses');
        console.log('  --tape-tc <port>       Test tape timecode sources');
        console.log('  --real-tc <port>       Find advancing timecode source');
        console.log('  --raw <port> <hex>     Send raw hex command');
        console.log('  --help                 Show this help');
        break;
        
      default:
        console.log(`❌ Unknown command: ${command}`);
        console.log('💡 Use --help to see available commands');
        break;
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Only run main() if this file is executed directly (not imported)
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

