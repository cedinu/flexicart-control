const { autoScanVtrs, getVtrStatus, VTR_PORTS, humanizeStatus, sendCommand } = require('../src/commands/vtr_interface');

/**
 * Calculate simple Sony 9-pin checksum (XOR of all bytes)
 */
function calculateChecksum(commandBytes) {
  let checksum = 0;
  for (let i = 0; i < commandBytes.length; i++) {
    checksum ^= commandBytes[i];
  }
  return checksum;
}

/**
 * Create Sony 9-pin command with checksum
 */
function createSonyCommand(cmdBytes) {
  const checksum = calculateChecksum(Buffer.from(cmdBytes));
  return Buffer.from([...cmdBytes, checksum]);
}

/**
 * Verify Sony 9-pin checksum
 */
function verifyChecksum(command) {
  if (command.length < 2) return false;
  
  const commandBytes = command.slice(0, -1); // All but last byte
  const providedChecksum = command[command.length - 1];
  const calculatedChecksum = calculateChecksum(commandBytes);
  
  return providedChecksum === calculatedChecksum;
}

// Update your VTR_COMMANDS to use the confirmed working format
const VTR_COMMANDS = {
  // Confirmed working HDW commands
  PLAY: Buffer.from([0x20, 0x01, 0x21]),           // Working: D7 BD
  STOP: Buffer.from([0x20, 0x00, 0x20]),           // Working: F7 7E F8
  PAUSE: Buffer.from([0x20, 0x02, 0x22]),          // Should work
  FAST_FORWARD: Buffer.from([0x20, 0x10, 0x30]),   // Working: F7 9F
  REWIND: Buffer.from([0x20, 0x20, 0x40]),         // Working: F7 F7 83
  
  // Status commands
  STATUS: Buffer.from([0x61, 0x20, 0x41]),         // Working: CF D7 00
  DEVICE_TYPE: Buffer.from([0x00, 0x11, 0x11]),    // Working: BA BA FC
  TIMECODE: Buffer.from([0x74, 0x20, 0x54]),       // Working: 91 77 00
  
  // Control commands
  LOCAL_DISABLE: Buffer.from([0x0C, 0x00, 0x0C])   // Working: 9E CE 00
};

// Also update VTR_COMMANDS_CORRECTED
const VTR_COMMANDS_CORRECTED = {
  // CORRECT Sony 9-pin transport commands
  PLAY: Buffer.from([0x20, 0x01, 0x21]),           // PLAY with checksum
  STOP: Buffer.from([0x20, 0x00, 0x20]),           // STOP with checksum  
  PAUSE: Buffer.from([0x20, 0x02, 0x22]),          // PAUSE with checksum
  FAST_FORWARD: Buffer.from([0x20, 0x10, 0x30]),   // FF with checksum
  REWIND: Buffer.from([0x20, 0x20, 0x40]),         // REW with checksum CORRECTED!
  RECORD: Buffer.from([0x20, 0x04, 0x24]),         // RECORD with checksum
  
  // Status commands (confirmed working)
  STATUS: Buffer.from([0x61, 0x20, 0x41]),         // Status with data request
  DEVICE_TYPE: Buffer.from([0x00, 0x11, 0x11]),    // Device type request
  TIMECODE: Buffer.from([0x74, 0x20, 0x54]),       // Timecode request
  TAPE_TIMER: Buffer.from([0x75, 0x20, 0x55]),     // Tape timer
  
  // Control commands
  LOCAL_DISABLE: Buffer.from([0x0C, 0x00, 0x0C]),  // Local disable
  LOCAL_ENABLE: Buffer.from([0x0C, 0x01, 0x0D])    // Local enable
};

// Simple format commands without STX/ETX framing
const VTR_COMMANDS_SIMPLE = {
  // Single byte commands
  PLAY: Buffer.from([0x20]),                     // Just PLAY command
  STOP: Buffer.from([0x2F]),                     // Just STOP command
  PAUSE: Buffer.from([0x25]),                    // Just PAUSE command
  STATUS: Buffer.from([0x61]),                   // Just STATUS command
  DEVICE_TYPE: Buffer.from([0x00]),              // Just DEVICE TYPE
  LOCAL_DISABLE: Buffer.from([0x0C]),            // Just LOCAL DISABLE
  
  // Two byte commands
  PLAY_PARAM: Buffer.from([0x20, 0x00]),         // PLAY with parameter
  STATUS_PARAM: Buffer.from([0x61, 0x20]),       // STATUS with parameter
  DEVICE_PARAM: Buffer.from([0x00, 0x11]),       // DEVICE with parameter
  
  // Three byte commands with checksum
  PLAY_CHECKSUM: Buffer.from([0x20, 0x00, 0x20]), // PLAY with checksum
  STATUS_CHECKSUM: Buffer.from([0x61, 0x20, 0x41]), // STATUS with checksum
  DEVICE_CHECKSUM: Buffer.from([0x00, 0x11, 0x11])  // DEVICE with checksum
};

/**
 * Send a control command to VTR
 * @param {string} path - VTR port path
 * @param {Buffer} command - Command buffer
 * @param {string} commandName - Human readable command name
 */
async function sendVtrCommand(path, command, commandName) {
  console.log(`📤 Sending ${commandName} command to ${path}...`);
  
  try {
    const response = await sendCommand(path, command, 3000);
    
    if (response && response.length > 0) {
      console.log(`✅ ${commandName} command sent successfully`);
      console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
      
      // Wait a bit then check status
      await new Promise(resolve => setTimeout(resolve, 500));
      const status = await getVtrStatus(path);
      console.log(`📊 New status: ${status.mode.toUpperCase()} - TC: ${status.timecode}`);
      
      return true;
    } else {
      console.log(`⚠️  ${commandName} command sent but no response received`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${commandName} command failed: ${error.message}`);
    return false;
  }
}

/**
 * Play command
 * @param {string} path - VTR port path
 */
async function playVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x01, 0x21]), 'PLAY');
}

/**
 * Pause command
 * @param {string} path - VTR port path
 */
async function pauseVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x02, 0x22]), 'PAUSE');
}

/**
 * Stop command
 * @param {string} path - VTR port path
 */
async function stopVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x00, 0x20]), 'STOP');
}

/**
 * Record command
 * @param {string} path - VTR port path
 */
async function recordVtr(path) {
  console.log('⚠️  RECORD command - use with caution!');
  return await sendVtrCommand(path, VTR_COMMANDS.RECORD, 'RECORD');
}

/**
 * Fast Forward command
 * @param {string} path - VTR port path
 */
async function fastForwardVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x10, 0x30]), 'FAST FORWARD');
}

/**
 * Rewind command
 * @param {string} path - VTR port path
 */
async function rewindVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x20, 0x40]), 'REWIND'); // CORRECTED checksum!
}

/**
 * HDW-specific command functions
 */
async function ejectTape(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.EJECT, 'EJECT');
}

async function jogForward(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_FORWARD, 'JOG FORWARD');
}

async function jogReverse(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_REVERSE, 'JOG REVERSE');
}

async function shuttlePlus1(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.SHUTTLE_PLUS_1, 'SHUTTLE +1x');
}

async function shuttleMinus1(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.SHUTTLE_MINUS_1, 'SHUTTLE -1x');
}

async function getExtendedStatus(path) {
  console.log(`📊 Getting extended status from ${path}...`);
  
  try {
    const response = await sendCommand(path, VTR_COMMANDS.EXTENDED_STATUS, 3000);
    console.log(`📥 Extended Status Response: ${response.toString('hex')}`);
    return response;
  } catch (error) {
    console.log(`❌ Extended status failed: ${error.message}`);
    return null;
  }
}

async function getDeviceType(path) {
  console.log(`🔍 Getting device type from ${path}...`);
  
  try {
    const response = await sendCommand(path, VTR_COMMANDS.DEVICE_TYPE, 3000);
    console.log(`📥 Device Type Response: ${response.toString('hex')}`);
    
    // Parse device type response
    if (response.length >= 4) {
      const deviceId = response[3];
      const deviceTypes = {
        0x10: 'BVW series',
        0x20: 'DVW series', 
        0x30: 'HDW series',
        0x40: 'J series',
        0x50: 'MSW series'
      };
      
      const deviceName = deviceTypes[deviceId] || `Unknown (0x${deviceId.toString(16)})`;
      console.log(`📺 Device Type: ${deviceName}`);
      return deviceName;
    }
    
    return 'Unknown';
  } catch (error) {
    console.log(`❌ Device type check failed: ${error.message}`);
    return null;
  }
}

/**
 * Check status of a specific VTR port
 * @param {string} path - VTR port path
 */
async function checkSingleVtr(path) {
  console.log(`\n🔍 Checking VTR at ${path}...`);
  
  try {
    const status = await getVtrStatus(path);
    
    if (status.error) {
      console.log(`❌ Error: ${status.error}`);
      return null;
    }
    
    console.log(`✅ VTR Found!`);
    console.log(`   📼 Timecode: ${status.timecode}`);
    console.log(`   ⚡ Mode: ${status.mode.toUpperCase()}`);
    console.log(`   🏃 Speed: ${status.speed}`);
    console.log(`   💾 Tape: ${status.tape ? 'IN' : 'OUT'}`);
    
    // If we have extended status, show it
    if (status.extended) {
      const readable = humanizeStatus(status, status.extended);
      console.log(`   📊 Status: ${readable}`);
    }
    
    return status;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return null;
  }
}

/**
 * Auto-scan all VTR ports and display results
 */
async function scanAllVtrs() {
  console.log('🔎 Scanning all VTR ports...');
  console.log(`📍 Checking ${VTR_PORTS.length} possible ports`);
  
  try {
    const foundVtrs = await autoScanVtrs();
    
    if (foundVtrs.length === 0) {
      console.log('\n❌ No VTRs detected on any port');
      console.log('💡 Make sure VTRs are:');
      console.log('   - Powered on');
      console.log('   - Connected via RS-422');
      console.log('   - Configured for serial control');
      return;
    }
    
    console.log(`\n✅ Found ${foundVtrs.length} VTR(s):`);
    
    foundVtrs.forEach((vtr, index) => {
      console.log(`\n📺 VTR #${index + 1} (${vtr.path})`);
      console.log(`   📼 Timecode: ${vtr.timecode}`);
      console.log(`   ⚡ Mode: ${vtr.mode.toUpperCase()}`);
      console.log(`   🏃 Speed: ${vtr.speed}`);
      console.log(`   💾 Tape: ${vtr.tape ? 'IN' : 'OUT'}`);
    });
    
  } catch (error) {
    console.log(`\n❌ Scan failed: ${error.message}`);
  }
}

/**
 * Enhanced control menu with HDW-specific commands
 */
async function controlVtr(path) {
  console.log(`\n🎮 HDW VTR Control Panel - ${path}`);
  console.log('=====================================');
  
  // First check device type
  await getDeviceType(path);
  
  // Check if VTR is responding
  try {
    const status = await getVtrStatus(path);
    console.log(`📊 Current Status: ${status.mode.toUpperCase()} - TC: ${status.timecode} - Tape: ${status.tape ? 'IN' : 'OUT'}`);
  } catch (error) {
    console.log(`❌ Cannot communicate with VTR: ${error.message}`);
    return;
  }
  
  console.log('\nTransport Commands:');
  console.log('  1. ▶️  Play');
  console.log('  2. ⏸️  Pause');
  console.log('  3. ⏹️  Stop');
  console.log('  4. ⏩ Fast Forward');
  console.log('  5. ⏪ Rewind');
  console.log('  6. 🔴 Record (CAUTION!)');
  console.log('  7. ⏏️  Eject');
  
  console.log('\nJog/Shuttle Commands:');
  console.log('  8. 🔄 Jog Forward');
  console.log('  9. 🔄 Jog Reverse');
  console.log(' 10. 🎯 Shuttle +1x');
  console.log(' 11. 🎯 Shuttle -1x');
  
  console.log('\nStatus Commands:');
  console.log(' 12. 📊 Check Status');
  console.log(' 13. 📈 Extended Status');
  console.log(' 14. 🔍 Device Type');
  console.log(' 15. 🚪 Exit');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const askCommand = () => {
    rl.question('\nEnter command number (1-15): ', async (answer) => {
      switch (answer.trim()) {
        case '1': await playVtr(path); break;
        case '2': await pauseVtr(path); break;
        case '3': await stopVtr(path); break;
        case '4': await fastForwardVtr(path); break;
        case '5': await rewindVtr(path); break;
        case '6':
          console.log('⚠️  Are you sure you want to record?');
          rl.question('Type "YES" to confirm: ', async (confirm) => {
            if (confirm === 'YES') await recordVtr(path);
            else console.log('❌ Record cancelled');
            askCommand();
          });
          return;
        case '7': await ejectTape(path); break;
        case '8': await jogForward(path); break;
        case '9': await jogReverse(path); break;
        case '10': await shuttlePlus1(path); break;
        case '11': await shuttleMinus1(path); break;
        case '12': await checkSingleVtr(path); break;
        case '13': await getExtendedStatus(path); break;
        case '14': await getDeviceType(path); break;
        case '15':
          console.log('👋 Exiting VTR control');
          rl.close();
          return;
        default:
          console.log('❌ Invalid command. Please enter 1-15.');
          break;
      }
      askCommand();
    });
  };
  
  askCommand();
}

/**
 * Batch control multiple VTRs
 * @param {Array} paths - Array of VTR port paths
 * @param {string} command - Command to send (play, pause, stop)
 */
async function batchControlVtrs(paths, command) {
  console.log(`🎬 Sending ${command.toUpperCase()} to ${paths.length} VTRs...`);
  
  const commandMap = {
    'play': playVtr,
    'pause': pauseVtr,
    'stop': stopVtr,
    'ff': fastForwardVtr,
    'rew': rewindVtr
  };
  
  const commandFunction = commandMap[command.toLowerCase()];
  if (!commandFunction) {
    console.log(`❌ Unknown command: ${command}`);
    return;
  }
  
  const results = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    console.log(`\n📺 VTR ${i + 1}/${paths.length} (${path})`);
    const success = await commandFunction(path);
    results.push({ path, success });
    
    // Small delay between commands
    if (i < paths.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Summary
  console.log(`\n📋 Batch ${command.toUpperCase()} Summary:`);
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`   ${status} VTR ${index + 1} (${result.path})`);
  });
}

/**
 * Test VTR commands
 */
async function testVtrCommands(path) {
  console.log(`🧪 Testing VTR commands on ${path}`);
  
  const commands = [
    { name: 'Status', cmd: VTR_COMMANDS.STATUS },
    { name: 'Play', cmd: VTR_COMMANDS.PLAY },
    { name: 'Pause', cmd: VTR_COMMANDS.PAUSE },
    { name: 'Stop', cmd: VTR_COMMANDS.STOP },
    { name: 'Timecode', cmd: VTR_COMMANDS.TIMECODE }
  ];
  
  for (const { name, cmd } of commands) {
    try {
      console.log(`\n📤 Sending ${name} command...`);
      const response = await sendCommand(path, cmd, 3000);
      console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
      
      // Wait between commands
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`❌ ${name} failed: ${error.message}`);
    }
  }
}

/**
 * Enhanced response analysis with detailed byte breakdown
 */
function analyzeResponse(response, commandName) {
  if (!response || response.length === 0) {
    console.log(`🔍 No response to analyze for ${commandName}`);
    return;
  }
  
  console.log(`🔍 Analyzing response for ${commandName}:`);
  console.log(`   📊 Length: ${response.length} bytes`);
  console.log(`   📊 Hex: ${response.toString('hex')}`);
  console.log(`   📊 Bytes: [${Array.from(response).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);
  console.log(`   📊 Decimal: [${Array.from(response).join(', ')}]`);
  console.log(`   📊 Binary: ${Array.from(response).map(b => b.toString(2).padStart(8, '0')).join(' ')}`);
  
  // Add decoder call for transport commands
  if (commandName.toLowerCase().includes('raw command')) {
    // Try to determine command type from response pattern
    if (response.length === 2 && response[0] === 0xD7) {
      console.log('\n🎮 Detected PLAY response pattern:');
      decodeVtrStatusResponse(response, 'play');
    } else if (response.length === 3 && response[0] === 0xF7 && response[1] === 0xF7) {
      console.log('\n⏪ Detected REWIND response pattern:');
      decodeVtrStatusResponse(response, 'rewind');
    } else if (response.length === 3 && response[0] === 0xF7 && response[1] === 0x7E) {
      console.log('\n🛑 Detected STOP response pattern:');
      decodeVtrStatusResponse(response, 'stop');
    } else if (response.length === 3 && response[0] === 0xBA) {
      console.log('\n📺 Detected DEVICE TYPE response:');
      decodeVtrStatusResponse(response, 'device type');
    }
  }
  
  // Existing analysis continues...
}

/**
 * Play command
 * @param {string} path - VTR port path
 */
async function playVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x01, 0x21]), 'PLAY');
}

/**
 * Pause command
 * @param {string} path - VTR port path
 */
async function pauseVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x02, 0x22]), 'PAUSE');
}

/**
 * Stop command
 * @param {string} path - VTR port path
 */
async function stopVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x00, 0x20]), 'STOP');
}

/**
 * Record command
 * @param {string} path - VTR port path
 */
async function recordVtr(path) {
  console.log('⚠️  RECORD command - use with caution!');
  return await sendVtrCommand(path, VTR_COMMANDS.RECORD, 'RECORD');
}

/**
 * Fast Forward command
 * @param {string} path - VTR port path
 */
async function fastForwardVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x10, 0x30]), 'FAST FORWARD');
}

/**
 * Rewind command
 * @param {string} path - VTR port path
 */
async function rewindVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x20, 0x40]), 'REWIND'); // CORRECTED checksum!
}

/**
 * HDW-specific command functions
 */
async function ejectTape(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.EJECT, 'EJECT');
}

async function jogForward(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_FORWARD, 'JOG FORWARD');
}

async function jogReverse(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_REVERSE, 'JOG REVERSE');
}

async function shuttlePlus1(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.SHUTTLE_PLUS_1, 'SHUTTLE +1x');
}

async function shuttleMinus1(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.SHUTTLE_MINUS_1, 'SHUTTLE -1x');
}

async function getExtendedStatus(path) {
  console.log(`📊 Getting extended status from ${path}...`);
  
  try {
    const response = await sendCommand(path, VTR_COMMANDS.EXTENDED_STATUS, 3000);
    console.log(`📥 Extended Status Response: ${response.toString('hex')}`);
    return response;
  } catch (error) {
    console.log(`❌ Extended status failed: ${error.message}`);
    return null;
  }
}

async function getDeviceType(path) {
  console.log(`🔍 Getting device type from ${path}...`);
  
  try {
    const response = await sendCommand(path, VTR_COMMANDS.DEVICE_TYPE, 3000);
    console.log(`📥 Device Type Response: ${response.toString('hex')}`);
    
    // Parse device type response
    if (response.length >= 4) {
      const deviceId = response[3];
      const deviceTypes = {
        0x10: 'BVW series',
        0x20: 'DVW series', 
        0x30: 'HDW series',
        0x40: 'J series',
        0x50: 'MSW series'
      };
      
      const deviceName = deviceTypes[deviceId] || `Unknown (0x${deviceId.toString(16)})`;
      console.log(`📺 Device Type: ${deviceName}`);
      return deviceName;
    }
    
    return 'Unknown';
  } catch (error) {
    console.log(`❌ Device type check failed: ${error.message}`);
    return null;
  }
}

/**
 * Check status of a specific VTR port
 * @param {string} path - VTR port path
 */
async function checkSingleVtr(path) {
  console.log(`\n🔍 Checking VTR at ${path}...`);
  
  try {
    const status = await getVtrStatus(path);
    
    if (status.error) {
      console.log(`❌ Error: ${status.error}`);
      return null;
    }
    
    console.log(`✅ VTR Found!`);
    console.log(`   📼 Timecode: ${status.timecode}`);
    console.log(`   ⚡ Mode: ${status.mode.toUpperCase()}`);
    console.log(`   🏃 Speed: ${status.speed}`);
    console.log(`   💾 Tape: ${status.tape ? 'IN' : 'OUT'}`);
    
    // If we have extended status, show it
    if (status.extended) {
      const readable = humanizeStatus(status, status.extended);
      console.log(`   📊 Status: ${readable}`);
    }
    
    return status;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return null;
  }
}

/**
 * Auto-scan all VTR ports and display results
 */
async function scanAllVtrs() {
  console.log('🔎 Scanning all VTR ports...');
  console.log(`📍 Checking ${VTR_PORTS.length} possible ports`);
  
  try {
    const foundVtrs = await autoScanVtrs();
    
    if (foundVtrs.length === 0) {
      console.log('\n❌ No VTRs detected on any port');
      console.log('💡 Make sure VTRs are:');
      console.log('   - Powered on');
      console.log('   - Connected via RS-422');
      console.log('   - Configured for serial control');
      return;
    }
    
    console.log(`\n✅ Found ${foundVtrs.length} VTR(s):`);
    
    foundVtrs.forEach((vtr, index) => {
      console.log(`\n📺 VTR #${index + 1} (${vtr.path})`);
      console.log(`   📼 Timecode: ${vtr.timecode}`);
      console.log(`   ⚡ Mode: ${vtr.mode.toUpperCase()}`);
      console.log(`   🏃 Speed: ${vtr.speed}`);
      console.log(`   💾 Tape: ${vtr.tape ? 'IN' : 'OUT'}`);
    });
    
  } catch (error) {
    console.log(`\n❌ Scan failed: ${error.message}`);
  }
}

/**
 * Enhanced control menu with HDW-specific commands
 */
async function controlVtr(path) {
  console.log(`\n🎮 HDW VTR Control Panel - ${path}`);
  console.log('=====================================');
  
  // First check device type
  await getDeviceType(path);
  
  // Check if VTR is responding
  try {
    const status = await getVtrStatus(path);
    console.log(`📊 Current Status: ${status.mode.toUpperCase()} - TC: ${status.timecode} - Tape: ${status.tape ? 'IN' : 'OUT'}`);
  } catch (error) {
    console.log(`❌ Cannot communicate with VTR: ${error.message}`);
    return;
  }
  
  console.log('\nTransport Commands:');
  console.log('  1. ▶️  Play');
  console.log('  2. ⏸️  Pause');
  console.log('  3. ⏹️  Stop');
  console.log('  4. ⏩ Fast Forward');
  console.log('  5. ⏪ Rewind');
  console.log('  6. 🔴 Record (CAUTION!)');
  console.log('  7. ⏏️  Eject');
  
  console.log('\nJog/Shuttle Commands:');
  console.log('  8. 🔄 Jog Forward');
  console.log('  9. 🔄 Jog Reverse');
  console.log(' 10. 🎯 Shuttle +1x');
  console.log(' 11. 🎯 Shuttle -1x');
  
  console.log('\nStatus Commands:');
  console.log(' 12. 📊 Check Status');
  console.log(' 13. 📈 Extended Status');
  console.log(' 14. 🔍 Device Type');
  console.log(' 15. 🚪 Exit');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const askCommand = () => {
    rl.question('\nEnter command number (1-15): ', async (answer) => {
      switch (answer.trim()) {
        case '1': await playVtr(path); break;
        case '2': await pauseVtr(path); break;
        case '3': await stopVtr(path); break;
        case '4': await fastForwardVtr(path); break;
        case '5': await rewindVtr(path); break;
        case '6':
          console.log('⚠️  Are you sure you want to record?');
          rl.question('Type "YES" to confirm: ', async (confirm) => {
            if (confirm === 'YES') await recordVtr(path);
            else console.log('❌ Record cancelled');
            askCommand();
          });
          return;
        case '7': await ejectTape(path); break;
        case '8': await jogForward(path); break;
        case '9': await jogReverse(path); break;
        case '10': await shuttlePlus1(path); break;
        case '11': await shuttleMinus1(path); break;
        case '12': await checkSingleVtr(path); break;
        case '13': await getExtendedStatus(path); break;
        case '14': await getDeviceType(path); break;
        case '15':
          console.log('👋 Exiting VTR control');
          rl.close();
          return;
        default:
          console.log('❌ Invalid command. Please enter 1-15.');
          break;
      }
      askCommand();
    });
  };
  
  askCommand();
}

/**
 * Batch control multiple VTRs
 * @param {Array} paths - Array of VTR port paths
 * @param {string} command - Command to send (play, pause, stop)
 */
async function batchControlVtrs(paths, command) {
  console.log(`🎬 Sending ${command.toUpperCase()} to ${paths.length} VTRs...`);
  
  const commandMap = {
    'play': playVtr,
    'pause': pauseVtr,
    'stop': stopVtr,
    'ff': fastForwardVtr,
    'rew': rewindVtr
  };
  
  const commandFunction = commandMap[command.toLowerCase()];
  if (!commandFunction) {
    console.log(`❌ Unknown command: ${command}`);
    return;
  }
  
  const results = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    console.log(`\n📺 VTR ${i + 1}/${paths.length} (${path})`);
    const success = await commandFunction(path);
    results.push({ path, success });
    
    // Small delay between commands
    if (i < paths.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Summary
  console.log(`\n📋 Batch ${command.toUpperCase()} Summary:`);
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`   ${status} VTR ${index + 1} (${result.path})`);
  });
}

/**
 * Test VTR commands
 */
async function testVtrCommands(path) {
  console.log(`🧪 Testing VTR commands on ${path}`);
  
  const commands = [
    { name: 'Status', cmd: VTR_COMMANDS.STATUS },
    { name: 'Play', cmd: VTR_COMMANDS.PLAY },
    { name: 'Pause', cmd: VTR_COMMANDS.PAUSE },
    { name: 'Stop', cmd: VTR_COMMANDS.STOP },
    { name: 'Timecode', cmd: VTR_COMMANDS.TIMECODE }
  ];
  
  for (const { name, cmd } of commands) {
    try {
      console.log(`\n📤 Sending ${name} command...`);
      const response = await sendCommand(path, cmd, 3000);
      console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
      
      // Wait between commands
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`❌ ${name} failed: ${error.message}`);
    }
  }
}

/**
 * Enhanced response analysis with detailed byte breakdown
 */
function analyzeResponse(response, commandName) {
  if (!response || response.length === 0) {
    console.log(`🔍 No response to analyze for ${commandName}`);
    return;
  }
  
  console.log(`🔍 Analyzing response for ${commandName}:`);
  console.log(`   📊 Length: ${response.length} bytes`);
  console.log(`   📊 Hex: ${response.toString('hex')}`);
  console.log(`   📊 Bytes: [${Array.from(response).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);
  console.log(`   📊 Decimal: [${Array.from(response).join(', ')}]`);
  console.log(`   📊 Binary: ${Array.from(response).map(b => b.toString(2).padStart(8, '0')).join(' ')}`);
  
  // Add decoder call for transport commands
  if (commandName.toLowerCase().includes('raw command')) {
    // Try to determine command type from response pattern
    if (response.length === 2 && response[0] === 0xD7) {
      console.log('\n🎮 Detected PLAY response pattern:');
      decodeVtrStatusResponse(response, 'play');
    } else if (response.length === 3 && response[0] === 0xF7 && response[1] === 0xF7) {
      console.log('\n⏪ Detected REWIND response pattern:');
      decodeVtrStatusResponse(response, 'rewind');
    } else if (response.length === 3 && response[0] === 0xF7 && response[1] === 0x7E) {
      console.log('\n🛑 Detected STOP response pattern:');
      decodeVtrStatusResponse(response, 'stop');
    } else if (response.length === 3 && response[0] === 0xBA) {
      console.log('\n📺 Detected DEVICE TYPE response:');
      decodeVtrStatusResponse(response, 'device type');
    }
  }
  
  // Existing analysis continues...
}

/**
 * Decode VTR status responses based on command type
 * @param {Buffer} response - VTR response buffer
 * @param {string} commandType - Type of command that generated the response
 * @returns {Object} Decoded status information
 */
function decodeVtrStatusResponse(response, commandType) {
  if (!response || response.length === 0) return null;
  
  console.log(`🔍 Decoding ${commandType} response:`);
  
  switch(commandType.toLowerCase()) {
    case 'play':
      if (response.length >= 2) {
        const status1 = response[0]; // 0xD7 = 11010111
        const status2 = response[1]; // 0xBD = 10111101
        
        console.log(`   🎮 HDW Play Status: 0x${status1.toString(16)} (${status1})`);
        console.log(`   📊 HDW Mode Status: 0x${status2.toString(16)} (${status2})`);
        
        // HDW-specific bit decoding
        if (status1 & 0x80) console.log(`     - Transport active`);
        if (status1 & 0x40) console.log(`     - Play mode engaged`);
        if (status1 & 0x20) console.log(`     - Servo locked`);
        if (status1 & 0x10) console.log(`     - Forward direction`);
        if (status1 & 0x08) console.log(`     - Tape moving`);
        if (status1 & 0x04) console.log(`     - Speed control active`);
        if (status1 & 0x02) console.log(`     - Audio monitoring`);
        if (status1 & 0x01) console.log(`     - Video output active`);
        
        return { 
          mode: 'PLAY', 
          transport: status1, 
          modeStatus: status2,
          isPlaying: (status1 & 0x40) !== 0
        };
      }
      break;
      
    case 'stop':
      if (response.length >= 3) {
        const status1 = response[0]; // 0xF7 = 11110111
        const status2 = response[1]; // 0x7E = 01111110  
        const status3 = response[2]; // 0xF8 = 11111000
        
        console.log(`   🛑 HDW Stop Status: 0x${status1.toString(16)} (${status1})`);
        console.log(`   📊 HDW Transport: 0x${status2.toString(16)} (${status2})`);
        console.log(`   🎛️  HDW System: 0x${status3.toString(16)} (${status3})`);
        
        // HDW stop mode decoding
        if (status1 & 0x80) console.log(`     - System ready`);
        if (status1 & 0x40) console.log(`     - Stop mode active`);
        if (status1 & 0x20) console.log(`         - Servo standby`);
        if (status1 & 0x10) console.log(`     - Tape threaded`);
        
        return { 
          mode: 'STOP', 
          transport: status1, 
          system: status2, 
          additional: status3,
          isStopped: true
        };
      }
      break;
      
    case 'rewind':
      if (response.length >= 3) {
        const status1 = response[0]; // 0xF7 = 11110111
        const status2 = response[1]; // 0xF7 = 11110111
        const status3 = response[2]; // 0x83 = 10000011
        
        console.log(`   ⏪ HDW Rewind Status: 0x${status1.toString(16)} (${status1})`);
        console.log(`   📊 HDW Direction: 0x${status2.toString(16)} (${status2})`);
        console.log(`   🎛️  HDW Speed: 0x${status3.toString(16)} (${status3})`);
        
        // HDW rewind mode decoding - notice status3 changed from F8 to 83!
        if (status3 & 0x80) console.log(`     - High speed rewind active`);
        if (status3 & 0x02) console.log(`     - Reverse direction confirmed`);
        if (status3 & 0x01) console.log(`     - Tape movement detected`);
        
        return { 
          mode: 'REWIND', 
          transport: status1, 
          direction: status2, 
          speed: status3,
          isRewinding: (status3 & 0x80) !== 0
        };
      }
      break;
      
    case 'device type':
      if (response.length >= 3) {
        const deviceId = response[0];   // 0xBA = HDW Series
        const subType = response[1];    // 0xBA = Subtype
        const version = response[2];    // 0xFC = Version/Status
        
        console.log(`   📺 HDW Device ID: 0x${deviceId.toString(16)} (${deviceId})`);
        console.log(`   📺 HDW Sub-type: 0x${subType.toString(16)} (${subType})`);
        console.log(`   📺 HDW Version: 0x${version.toString(16)} (${version})`);
        
        let deviceModel = 'Unknown HDW';
        if (deviceId === 0xBA) {
          if (subType === 0xBA) {
            deviceModel = 'Sony HDW-500/750/M2000 Series';
          }
        }
        
        console.log(`   📺 Identified: ${deviceModel}`);
        
        return { 
          deviceId, 
          subType, 
          version, 
          deviceModel, 
          series: 'HDW',
          raw: response 
        };
      }
      break;
  }
  
  return { raw: response };
}

/**
 * Call the main function if this file is run directly
 */
if (require.main === module) {
  interactiveCheck().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

// Export functions for use by other modules
module.exports = {
  checkSingleVtr,
  checkSingleVtrEnhanced,
  scanAllVtrs,
  monitorVtr,
  testVtrCommands,
  testCommunication,
  testNoTapeCommands,
  testAlternativeCommands,
  testChecksumCommands,
  testExtendedStatus,
  checkTapeStatus,
  diagnosticCheck,
  establishRemoteControl,
  showTroubleshootingGuide,
  showVtrMenuGuide,
  sendRawCommand,
  calculateChecksum,
  createSonyCommand,
  verifyChecksum,
  playVtr,
  pauseVtr,
  stopVtr,
  recordVtr,
  fastForwardVtr,
  rewindVtr,
  ejectTape,
  jogForward,
  jogReverse,
  shuttlePlus1,
  shuttleMinus1,
  getExtendedStatus,
  getDeviceType,
  controlVtr,
  batchControlVtrs,
  sendVtrCommand,
  analyzeResponse,
  diagnoseMenuIssue,
  testModelVariants,
  VTR_COMMANDS,
  VTR_COMMANDS_CORRECTED,
  testCommandFormats,
  testSimpleCommands,
  decodeVtrStatusResponse
};
