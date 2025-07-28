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
  VTR_STATUS_COMMANDS,  // ✅ Import this constant
  DEVICE_TYPES,
  VTR_STATUS_PATTERNS,
  VtrStatusError
} = require('../src/commands/vtr_cmds_status');

// ✅ KEEP - These are test-specific and not in the status module:

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
 * Get actual timecode from VTR using LTC (working method)
 * @param {string} path - VTR port path
 * @returns {Promise<string>} Timecode string
 */
async function getVtrTimecode(path) {
  try {
    // Use LTC Time Data command (78 20 58) - this works!
    const response = await sendCommand(path, Buffer.from([0x78, 0x20, 0x58]), 3000);
    
    if (response && response.length >= 3) {
      // Decode using the working packed format
      const decoded = decodeTimecodeResponse(response, 'LTC');
      
      if (decoded && decoded !== 'N/A') {
        return decoded;
      }
      
      // Fallback: try Timer1 command
      const timer1Response = await sendCommand(path, Buffer.from([0x75, 0x20, 0x55]), 3000);
      if (timer1Response && timer1Response.length >= 3) {
        const timer1Decoded = decodeTimecodeResponse(timer1Response, 'Timer1');
        if (timer1Decoded && timer1Decoded !== 'N/A') {
          return `T1:${timer1Decoded}`;
        }
      }
      
      return 'TC:STATIC'; // Timecode present but not advancing
    }
    
    return 'TC:NO_RESPONSE';
  } catch (error) {
    console.debug(`Timecode request failed: ${error.message}`);
    return 'TC:ERROR';
  }
}


/**
 * Send raw command to VTR
 * @param {string} path - VTR port path  
 * @param {string} commandString - Hex command string (e.g., "20 01 21")
 */
async function sendRawCommand(path, commandString) {
  // Add validation
  if (!path || typeof path !== 'string') {
    throw new VtrError('Invalid port path provided', 'INVALID_PATH');
  }
  
  if (!commandString || typeof commandString !== 'string') {
    throw new VtrError('Invalid command string provided', 'INVALID_COMMAND');
  }
  
  // Validate hex format
  const hexPattern = /^[\da-fA-F\s]+$/;
  if (!hexPattern.test(commandString.trim())) {
    throw new VtrError('Command must be in hex format (e.g., "20 01 21")', 'INVALID_HEX');
  }
  
  console.log(`🔧 Sending raw command: ${commandString}`);
  
  try {
    // Parse hex command string
    const commandBytes = commandString.split(' ').map(hex => parseInt(hex, 16));
    const command = Buffer.from(commandBytes);
    
    console.log(`📤 Command bytes: ${command.toString('hex')}`);
    console.log(`📤 Command length: ${command.length} bytes`);
    console.log(`📤 Individual bytes: [${Array.from(command).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);
    
    const response = await sendCommand(path, command, 3000);
    
    if (response && response.length > 0) {
      console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
      console.log(`📥 Individual bytes: [${Array.from(response).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);
      console.log(`📥 ASCII: "${response.toString('ascii').replace(/[^\x20-\x7E]/g, '.')}"`);
      console.log(`📥 Binary: ${Array.from(response).map(b => b.toString(2).padStart(8, '0')).join(' ')}`);
      
      // Analyze the response
      analyzeResponse(response, 'Raw Command');
    } else {
      console.log('❌ No response received');
    }
    
  } catch (error) {
    console.log(`❌ Raw command failed: ${error.message}`);
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
 * Test timecode during transport to see if it updates (alias for testTimecodeAdvancement)
 * @param {string} path - VTR port path
 */
async function testTimecodeMovement(path) {
  return await testTimecodeAdvancement(path);
}

/**
 * Get detailed timecode from multiple sources
 * @param {string} path - VTR port path  
 * @returns {string} Detailed timecode info
 */
async function getDetailedTimecode(path) {
  const commands = [
    { name: 'Standard', cmd: Buffer.from([0x74, 0x20, 0x54]) },
    { name: 'LTC', cmd: Buffer.from([0x78, 0x20, 0x58]) },
    { name: 'Timer1', cmd: Buffer.from([0x75, 0x20, 0x55]) }
  ];
  
  const results = [];
  
  for (const cmd of commands) {
    try {
      const response = await sendCommand(path, cmd.cmd, 1000);
      const decoded = decodeTimecodeResponse(response, cmd.name);
      results.push(`${cmd.name}:${decoded || 'N/A'}`);
    } catch (e) {
      results.push(`${cmd.name}:ERROR`);
    }
  }
  
  return results.join(' | ');
}

/**
 * Decode timecode response based on Sony 9-pin protocol variations
 * @param {Buffer} response - Raw response buffer
 * @param {string} commandName - Name of command that generated response
 * @returns {string|null} Decoded timecode or null if not valid
 */
function decodeTimecodeResponse(response, commandName) {
  if (!response || response.length < 3) return null;
  
  const bytes = Array.from(response);
  const hex = response.toString('hex');
  
  console.log(`🔍 Analyzing ${commandName} response pattern:`);
  
  // Check for "no timecode" patterns
  if (hex === '917700' || hex === '919100' || hex === '000000') {
    console.log(`   ⚠️  Pattern indicates no timecode available`);
    return null;
  }
  
  // Try different Sony 9-pin timecode formats
  
  // Format 1: Standard BCD timecode (4+ bytes)
  if (response.length >= 4) {
    try {
      const hours = bcdToBin(bytes[0]);
      const minutes = bcdToBin(bytes[1]);
      const seconds = bcdToBin(bytes[2]);
      const frames = bcdToBin(bytes[3]);
      
      if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
        const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
        console.log(`   ✅ BCD format: ${timecode}`);
        return timecode;
      }
    } catch (e) {
      // BCD decode failed, try other formats
    }
  }
  
  // Format 2: Binary timecode
  if (response.length >= 4) {
    const hours = bytes[0];
    const minutes = bytes[1];
    const seconds = bytes[2];
    const frames = bytes[3];
    
    if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
      const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
      console.log(`   ✅ Binary format: ${timecode}`);
      return timecode;
    }
  }
  
  // Format 3: Packed timecode (Sony specific)
  if (response.length >= 3) {
    try {
      const packed = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
      const frames = packed & 0x3F;
      const seconds = (packed >> 6) & 0x3F;
      const minutes = (packed >> 12) & 0x3F;
      const hours = (packed >> 18) & 0x1F;
      
      if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
        const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
        console.log(`   ✅ Packed format: ${timecode}`);
        return timecode;
      }
    } catch (e) {
      // Packed decode failed
    }
  }
  
  console.log(`   ❓ Unknown format - Raw: ${hex}`);
  return null;
}

/**
 * Convert BCD (Binary Coded Decimal) to binary
 * @param {number} bcd - BCD byte
 * @returns {number} Binary value
 */
function bcdToBin(bcd) {
  return ((bcd >> 4) * 10) + (bcd & 0x0F);
}

/**
 * Test which timecode source changes during transport to find the real tape timecode
 * @param {string} path - VTR port path
 */
async function testRealTapeTimecode(path) {
  console.log('🎬 Testing which timecode advances with tape movement...\n');
  
  // The working commands we discovered
  const timecodeCommands = [
    { name: 'Tape LTC Reader', cmd: Buffer.from([0x71, 0x00, 0x71]) },
    { name: 'LTC Reader Data', cmd: Buffer.from([0x78, 0x00, 0x78]) },
    { name: 'VITC Reader Data', cmd: Buffer.from([0x79, 0x00, 0x79]) },
    { name: 'HDW Current TC', cmd: Buffer.from([0x61, 0x0A, 0x6B]) },
    { name: 'HDW LTC Read', cmd: Buffer.from([0x61, 0x0C, 0x6D]) },
    { name: 'Tape Timer', cmd: Buffer.from([0x72, 0x00, 0x72]) },
    { name: 'CTL Counter', cmd: Buffer.from([0x73, 0x20, 0x53]) },
    { name: 'Time Data', cmd: Buffer.from([0x61, 0x12, 0x73]) }
  ];
  
  try {
    // Get baseline readings
    console.log('📤 Getting baseline timecode readings...');
    const baseline = {};
    for (const tcCmd of timecodeCommands) {
      try {
        const response = await sendCommand(path, tcCmd.cmd, 1000);
        const decoded = decodeTapeTimecode(response, tcCmd.name);
        baseline[tcCmd.name] = decoded;
        console.log(`📊 ${tcCmd.name}: ${decoded || 'N/A'}`);
      } catch (e) {
        baseline[tcCmd.name] = 'ERROR';
      }
    }
    
    // Start PLAY
    console.log('\n📤 Starting PLAY and monitoring timecode changes...');
    await sendVtrCommand(path, Buffer.from([0x20, 0x01, 0x21]), 'PLAY');
    
    // Sample 3 times during play
    const samples = [];
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      console.log(`\n📊 PLAY Sample ${i + 1}:`);
      const sample = {};
      for (const tcCmd of timecodeCommands) {
        try {
          const response = await sendCommand(path, tcCmd.cmd, 1000);
          const decoded = decodeTapeTimecode(response, tcCmd.name);
          sample[tcCmd.name] = decoded;
          
          // Check if this value changed from baseline
          const changed = baseline[tcCmd.name] !== decoded;
          const marker = changed ? '🔄 CHANGED!' : '⏸️  Static';
          console.log(`   ${tcCmd.name}: ${decoded || 'N/A'} ${marker}`);
        } catch (e) {
          sample[tcCmd.name] = 'ERROR';
        }
      }
      samples.push(sample);
    }
    
    // Stop transport
    console.log('\n📤 Stopping transport...');
    await sendVtrCommand(path, Buffer.from([0x20, 0x00, 0x20]), 'STOP');
    
    // Analysis
    console.log('\n📊 ANALYSIS - Sources that changed during PLAY:');
    const changingSources = [];
    
    for (const tcCmd of timecodeCommands) {
      const values = [baseline[tcCmd.name], ...samples.map(s => s[tcCmd.name])];
      const uniqueValues = new Set(values.filter(v => v && v !== 'N/A' && v !== 'ERROR'));
      
      if (uniqueValues.size > 1) {
        console.log(`✅ ${tcCmd.name}: ADVANCING (${Array.from(uniqueValues).join(' → ')})`);
        changingSources.push({
          name: tcCmd.name,
          command: tcCmd.cmd.toString('hex'),
          values: Array.from(uniqueValues)
        });
      } else {
        console.log(`❌ ${tcCmd.name}: STATIC (${baseline[tcCmd.name]})`);
      }
    }
    
    if (changingSources.length > 0) {
      console.log('\n🎯 REAL TAPE TIMECODE SOURCES FOUND:');
      changingSources.forEach(source => {
        console.log(`🎯 ${source.name} (${source.command}) - Use this for real tape timecode!`);
      });
      
      return changingSources;
    } else {
      console.log('\n⚠️  No timecode sources advanced during PLAY');
      console.log('   This suggests the tape may not be moving or no timecode is recorded');
      return [];
    }
    
  } catch (error) {
    console.log(`❌ Real tape timecode test failed: ${error.message}`);
    return [];
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
        case 'play':
          await playVtr(path);
          break;
          
        case 'stop':
          await stopVtr(path);
          break;
          
        case 'ff':
        case 'fastforward':
          await fastForwardVtr(path);
          break;
          
        case 'rew':
        case 'rewind':
          await rewindVtr(path);
          break;
          
        case 'jog-fwd':
        case 'jog-forward':
          await jogForward(path);
          break;
          
        case 'jog-rev':
        case 'jog-reverse':
          await jogReverse(path);
          break;
          
        case 'jog-still':
          await jogStill(path);
          break;
          
        case 'eject':
          await ejectTape(path);
          break;
          
        case 'status':
          await checkSingleVtr(path);
          break;
          
        case 'debug-status':
          await debugStatusResponses(path);
          break;
          
        case 'tc-test':
          await testAllTimecodeCommands(path);
          break;
          
        case 'tc-movement':
          await testTimecodeMovement(path);
          break;
          
        case 'tc-detailed':
          const detailed = await getDetailedTimecode(path);
          console.log(`📊 Detailed timecode: ${detailed}`);
          break;
          
        case 'tc-tape':
          await testTapeTimecodeCommands(path);
          break;
          
        case 'tc-real':
        case 'tc-real-test':
          const realSources = await testRealTapeTimecode(path);
          if (realSources.length > 0) {
            console.log('\n🎯 Recommended timecode commands for real tape position:');
            realSources.forEach(source => {
              console.log(`   ${source.name}: ${source.command}`);
            });
          }
          break;
          
        case 'tc-comprehensive':
          await getComprehensiveTimecode(path);
          break;
          
        case 'tc-advancement':
          await testTimecodeAdvancement(path);
          break;
          
        case 'quit':
        case 'exit':
          console.log('👋 Goodbye!');
          rl.close();
          process.exit(0);
          break;
          
        case 'help':
        case '?':
          console.log('\n📋 Available Commands:');
          console.log('Transport: play, stop, ff, rew, jog-fwd, jog-rev, jog-still, eject');
          console.log('Status: status, debug-status');
          console.log('Timecode: tc-test, tc-movement, tc-detailed, tc-tape, tc-real');
          console.log('Control: quit, help');
          break;
          
        default:
          if (command) {
            console.log(`❌ Unknown command: ${command}`);
            console.log('💡 Type "help" for available commands');
          }
          break;
      }
    } catch (error) {
      console.log(`❌ Command failed: ${error.message}`);
    }
    
    rl.prompt();
  });
  
  rl.on('close', () => {
    console.log('\n👋 VTR control session ended');
    process.exit(0);
  });
}

/**
 * Debug status responses with detailed analysis
 * @param {string} path - VTR port path
 */
async function debugStatusResponses(path) {
  console.log(`🔍 Debug status responses for ${path}...\n`);
  
  const statusCommands = [
    { name: 'Basic Status', cmd: Buffer.from([0x61, 0x20, 0x41]) },
    { name: 'Device Type', cmd: Buffer.from([0x00, 0x11, 0x11]) },
    { name: 'Timecode', cmd: Buffer.from([0x74, 0x20, 0x54]) },
    { name: 'LTC Timecode', cmd: Buffer.from([0x78, 0x20, 0x58]) },
    { name: 'Timer1', cmd: Buffer.from([0x75, 0x20, 0x55]) }
  ];
  
  for (const statusCmd of statusCommands) {
    try {
      console.log(`📤 Testing ${statusCmd.name}...`);
      const response = await sendCommand(path, statusCmd.cmd, 3000);
      
      if (response && response.length > 0) {
        analyzeResponse(response, statusCmd.name);
        
        // Try to decode if it looks like timecode
        if (statusCmd.name.includes('Timecode') || statusCmd.name.includes('Timer')) {
          const decoded = decodeTimecodeResponse(response, statusCmd.name);
          if (decoded) {
            console.log(`   🕐 Decoded: ${decoded}`);
          }
        }
      } else {
        console.log(`   ❌ No response`);
      }
      
      console.log(''); // Empty line for readability
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    }
  }
}

/**
 * Enhanced timecode decoder for tape-specific formats
 * @param {Buffer} response - Raw response buffer
 * @param {string} commandName - Name of command that generated response
 * @returns {string|null} Decoded timecode or null if not valid
 */
function decodeTapeTimecode(response, commandName) {
  if (!response || response.length < 3) return null;
  
  const bytes = Array.from(response);
  const hex = response.toString('hex');
  
  console.log(`🔍 Analyzing ${commandName} response pattern:`);
  
  // Try different tape timecode formats
  if (response.length >= 4) {
    try {
      const hours = ((bytes[0] >> 4) * 10) + (bytes[0] & 0x0F);
      const minutes = ((bytes[1] >> 4) * 10) + (bytes[1] & 0x0F);
      const seconds = ((bytes[2] >> 4) * 10) + (bytes[2] & 0x0F);
      const frames = ((bytes[3] >> 4) * 10) + (bytes[3] & 0x0F);
      
      if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
        const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
        console.log(`   ✅ BCD Tape format: ${timecode}`);
        return timecode;
      }
    } catch (e) {
      // BCD decode failed
    }
  }
  
  if (response.length >= 4) {
    const hours = bytes[0];
    const minutes = bytes[1];
    const seconds = bytes[2];
    const frames = bytes[3];
    
    if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
      const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
      console.log(`   ✅ Binary Tape format: ${timecode}`);
      return timecode;
    }
  }
  
  if (response.length >= 3) {
    try {
      const packed = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
      const frames_alt = (packed >> 0) & 0x3F;
      const seconds_alt = (packed >> 6) & 0x3F;
      const minutes_alt = (packed >> 12) & 0x3F;
      const hours_alt = (packed >> 18) & 0x1F;
      
      if (hours_alt <= 23 && minutes_alt <= 59 && seconds_alt <= 59 && frames_alt <= 29) {
        const timecode = `${hours_alt.toString().padStart(2, '0')}:${minutes_alt.toString().padStart(2, '0')}:${seconds_alt.toString().padStart(2, '0')}:${frames_alt.toString().padStart(2, '0')}`;
        console.log(`   ✅ HDW Tape format: ${timecode}`);
        return timecode;
      }
    } catch (e) {
      // Packed decode failed
    }
  }
  
  console.log(`   ❓ No valid tape timecode found - Raw: ${hex}`);
  return null;
}

// Export functions for use by other modules
module.exports = {
  // Test-specific functions (keep these)
  scanAllVtrs,
  testVtrCommands,
  testChecksumCommands,
  diagnosticCheck,
  showTroubleshootingGuide,
  showVtrMenuGuide,
  sendRawCommand,
  calculateChecksum,
  createSonyCommand,
  verifyChecksum,
  controlVtr,
  diagnoseMenuIssue,
  testModelVariants,
  testCommandFormats,
  testSimpleCommands,
  
  // Timecode functions (keep these)
  testAllTimecodeCommands,
  testTimecodeMovement,
  getDetailedTimecode,
  decodeTimecodeResponse,
  testTimecodeAdvancement,
  getComprehensiveTimecode,
  testTapeTimecodeCommands,
  decodeTapeTimecode,
  testRealTapeTimecode,
  bcdToBin,
  
  // Re-export transport functions
  ...require('../src/commands/vtr_cmds_transport'),
  
  // Re-export status functions
  ...require('../src/commands/vtr_cmds_status')
};

// ===== MAIN EXECUTION BLOCK =====
/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Show help if no arguments
  if (args.length === 0) {
    console.log('🎛️ VTR Control System');
    console.log('===================');
    console.log('\nUsage:');
    console.log('  node check_vtr_status.js --scan                    # Scan for VTRs');
    console.log('  node check_vtr_status.js --control <port>          # Interactive control');
    console.log('  node check_vtr_status.js --test <port>             # Test commands');
    console.log('  node check_vtr_status.js --status <port>           # Check status');
    console.log('  node check_vtr_status.js --timecode <port>         # Test timecode');
    console.log('  node check_vtr_status.js --raw <port> <hex_cmd>    # Send raw command');
    console.log('\nExamples:');
    console.log('  node check_vtr_status.js --scan');
    console.log('  node check_vtr_status.js --control /dev/ttyRP11');
    console.log('  node check_vtr_status.js --test /dev/ttyRP11');
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
        
      case '--control':
        if (!vtrPath) {
          console.log('❌ Error: Port path required for control mode');
          console.log('Usage: node check_vtr_status.js --control <port>');
          return;
        }
        console.log(`🎛️ Starting interactive control for ${vtrPath}...`);
        await controlVtr(vtrPath);
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
        
      case '--status':
        if (!vtrPath) {
          console.log('❌ Error: Port path required for status check');
          console.log('Usage: node check_vtr_status.js --status <port>');
          return;
        }
        console.log(`📊 Checking status of VTR at ${vtrPath}...`);
        await checkSingleVtrEnhanced(vtrPath);
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
        console.log('  --control <port>       Interactive VTR control');
        console.log('  --test <port>          Run diagnostic tests');
        console.log('  --status <port>        Check VTR status');
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

