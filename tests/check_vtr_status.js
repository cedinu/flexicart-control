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

// Original VTR Commands (without proper checksums - for reference)
const VTR_COMMANDS = {
  // Transport Control Commands
  PLAY: Buffer.from([0x88, 0x01, 0x2C, 0x01, 0xFF]),
  STOP: Buffer.from([0x88, 0x01, 0x20, 0x0F, 0xFF]),
  PAUSE: Buffer.from([0x88, 0x01, 0x25, 0x11, 0xFF]),
  RECORD: Buffer.from([0x88, 0x01, 0x2F, 0x01, 0xFF]),
  FAST_FORWARD: Buffer.from([0x88, 0x01, 0x21, 0x0F, 0xFF]),
  REWIND: Buffer.from([0x88, 0x01, 0x22, 0x0F, 0xFF]),
  
  // Status and Information Commands
  STATUS: Buffer.from([0x88, 0x01, 0x61, 0x20, 0xFF]),
  TIMECODE: Buffer.from([0x88, 0x01, 0x74, 0x20, 0xFF]),
  
  // Control Commands
  LOCAL_DISABLE: Buffer.from([0x88, 0x01, 0x0C, 0x00, 0xFF]),
  LOCAL_ENABLE: Buffer.from([0x88, 0x01, 0x0C, 0x01, 0xFF]),
  DEVICE_TYPE: Buffer.from([0x88, 0x01, 0x00, 0x11, 0xFF]),
  
  // HDW-specific commands
  EJECT: Buffer.from([0x88, 0x01, 0x2A, 0x05, 0xFF]),
  EXTENDED_STATUS: Buffer.from([0x88, 0x01, 0x65, 0x20, 0xFF]),
  
  // Jog/Shuttle commands
  JOG_FORWARD: Buffer.from([0x88, 0x01, 0x31, 0x01, 0xFF]),
  JOG_REVERSE: Buffer.from([0x88, 0x01, 0x32, 0x01, 0xFF]),
  SHUTTLE_PLUS_1: Buffer.from([0x88, 0x01, 0x33, 0x01, 0xFF]),
  SHUTTLE_MINUS_1: Buffer.from([0x88, 0x01, 0x34, 0x01, 0xFF])
};

// Corrected VTR Commands - Sony 9-pin protocol (simple format, no STX/ETX)
const VTR_COMMANDS_CORRECTED = {
  // Transport commands (correct Sony 9-pin format)
  PLAY: Buffer.from([0x20, 0x00, 0x20]),           // PLAY with checksum
  STOP: Buffer.from([0x20, 0x0F, 0x2F]),           // STOP with checksum  
  PAUSE: Buffer.from([0x20, 0x01, 0x21]),          // PAUSE with checksum
  FAST_FORWARD: Buffer.from([0x20, 0x10, 0x30]),   // FF with checksum
  REWIND: Buffer.from([0x20, 0x20, 0x00]),         // REW with checksum
  RECORD: Buffer.from([0x20, 0x02, 0x22]),         // RECORD with checksum
  
  // Status commands  
  STATUS: Buffer.from([0x61, 0x20, 0x41]),         // Status with data request
  STATUS_SIMPLE: Buffer.from([0x61, 0x61]),        // Simple status
  DEVICE_TYPE: Buffer.from([0x00, 0x11, 0x11]),    // Device type request
  
  // Control commands
  LOCAL_DISABLE: Buffer.from([0x0C, 0x00, 0x0C]),  // Local disable
  LOCAL_ENABLE: Buffer.from([0x0C, 0x01, 0x0D]),   // Local enable
  
  // Timer commands
  TIMECODE: Buffer.from([0x74, 0x20, 0x54]),       // Timecode request
  TAPE_TIMER: Buffer.from([0x75, 0x20, 0x55])      // Tape timer
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
  return await sendVtrCommand(path, VTR_COMMANDS.PLAY, 'PLAY');
}

/**
 * Pause command
 * @param {string} path - VTR port path
 */
async function pauseVtr(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.PAUSE, 'PAUSE');
}

/**
 * Stop command
 * @param {string} path - VTR port path
 */
async function stopVtr(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.STOP, 'STOP');
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
  return await sendVtrCommand(path, VTR_COMMANDS.FAST_FORWARD, 'FAST FORWARD');
}

/**
 * Rewind command
 * @param {string} path - VTR port path
 */
async function rewindVtr(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.REWIND, 'REWIND');
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
 * Analyze Sony VTR response codes - CORRECTED VERSION
 */
function analyzeResponse(response, commandName) {
  if (response.length === 0) return;
  
  console.log(`🔍 Analyzing response for ${commandName}:`);
  
  if (response.length >= 2) {
    const responseCode = (response[0] << 8) | response[1]; // Combine first two bytes
    const firstByte = response[0];
    const secondByte = response[1];
    
    console.log(`   Response bytes: ${response[0].toString(16).padStart(2, '0')} ${response[1].toString(16).padStart(2, '0')}`);
    
    if (firstByte === 0x10 && secondByte === 0x01) {
      console.log(`   ✅ ACK (10 01) - Command acknowledged and executed successfully!`);
    } else if (firstByte === 0x11 && secondByte === 0x12) {
      console.log(`   ⚠️  NAK (11 12) - Command acknowledged but NOT executed`);
      console.log(`   💡 Possible reasons: No tape, local mode, tape protection, etc.`);
    } else if (firstByte === 0x11 && secondByte === 0x11) {
      console.log(`   ❌ UNDEFINED (11 11) - Undefined command or parameter error`);
    } else if (firstByte === 0x10 && secondByte === 0x13) {
      console.log(`   ⏸️  COMPLETION (10 13) - Previous command completed`);
    } else if (firstByte >= 0x80) {
      console.log(`   📊 STATUS DATA - Response contains status information`);
      console.log(`   📈 Data length: ${response.length} bytes`);
    } else {
      console.log(`   ❓ UNKNOWN - Response code: ${firstByte.toString(16)} ${secondByte.toString(16)}`);
    }
  } else {
    // Single byte response (unusual)
    const firstByte = response[0];
    console.log(`   Single byte response: 0x${firstByte.toString(16)}`);
    
    if (firstByte === 0x11) {
      console.log(`   ⚠️  Partial NAK - May be incomplete response`);
    } else {
      console.log(`   ❓ Unknown single byte response`);
    }
  }
}

/**
 * Test basic communication with VTR
 */
async function testCommunication(path) {
  console.log(`🔧 Testing basic communication with ${path}...`);
  
  // Test different commands with shorter timeouts
  const testCommands = [
    { name: 'Device Type', cmd: VTR_COMMANDS.DEVICE_TYPE, timeout: 1000 },
    { name: 'Status (Basic)', cmd: Buffer.from([0x88, 0x01, 0x61, 0xFF]), timeout: 1000 },
    { name: 'Status (Extended)', cmd: VTR_COMMANDS.STATUS, timeout: 2000 },
    { name: 'Local Disable', cmd: VTR_COMMANDS.LOCAL_DISABLE, timeout: 1000 }
  ];
  
  for (const test of testCommands) {
    console.log(`\n📡 Testing ${test.name}...`);
    console.log(`   Command: ${test.cmd.toString('hex')}`);
    
    try {
      const response = await sendCommand(path, test.cmd, test.timeout);
      if (response && response.length > 0) {
        console.log(`   ✅ Response: ${response.toString('hex')} (${response.length} bytes)`);
        analyzeResponse(response, test.name);
        return true; // Found working communication
      } else {
        console.log(`   ⚠️  No response`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return false;
}

/**
 * Port diagnostic function
 */
async function diagnosticCheck(path) {
  console.log(`🔬 Diagnostic Check for ${path}`);
  console.log('===============================\n');
  
  // 1. Test if port exists and can be opened
  console.log('1️⃣ Testing port accessibility...');
  try {
    const { SerialPort } = require('serialport');
    const testPort = new SerialPort({
      path,
      baudRate: 38400,
      autoOpen: false
    });
    
    await new Promise((resolve, reject) => {
      testPort.open((err) => {
        if (err) reject(err);
        else {
          testPort.close();
          resolve();
        }
      });
    });
    console.log('   ✅ Port can be opened');
  } catch (error) {
    console.log(`   ❌ Cannot open port: ${error.message}`);
    return false;
  }
  
  // 2. Test different baud rates
  console.log('\n2️⃣ Testing different baud rates...');
  const baudRates = [38400, 9600, 19200];
  
  for (const baud of baudRates) {
    console.log(`   Testing ${baud} baud...`);
    try {
      // Temporarily modify the baud rate for testing
      const originalSendCommand = sendCommand;
      const testSendCommand = async (path, command, timeout) => {
        // This would require modifying the sendCommand to accept baud rate
        // For now, just test the standard rate
        return originalSendCommand(path, command, timeout);
      };
      
      const response = await testSendCommand(path, VTR_COMMANDS.DEVICE_TYPE, 1000);
      if (response && response.length > 0) {
        console.log(`   ✅ ${baud} baud works! Response: ${response.toString('hex')}`);
        break;
      }
    } catch (error) {
      console.log(`   ❌ ${baud} baud failed`);
    }
  }
  
  // 3. Test basic communication
  console.log('\n3️⃣ Testing basic communication...');
  const commWorking = await testCommunication(path);
  
  if (!commWorking) {
    console.log('\n❌ No communication established');
    console.log('💡 Troubleshooting tips:');
    console.log('   - Check physical RS-422 connections');
    console.log('   - Verify VTR is powered on');
    console.log('   - Check if VTR is in REMOTE mode (not LOCAL)');
    console.log('   - Try different baud rates');
    console.log('   - Check cable wiring (TX/RX, +/-)');
    return false;
  }
  
  console.log('\n✅ Basic communication working!');
  return true;
}

/**
 * Enhanced VTR status check with fallback methods
 */
async function checkSingleVtrEnhanced(path) {
  console.log(`\n🔍 Enhanced VTR Check - ${path}`);
  console.log('=====================================');
  
  // First try diagnostic check
  const commOk = await diagnosticCheck(path);
  if (!commOk) {
    return null;
  }
  
  // Try different status commands
  const statusCommands = [
    { name: 'Basic Status', cmd: Buffer.from([0x88, 0x01, 0x61, 0xFF]) },
    { name: 'Extended Status', cmd: VTR_COMMANDS.STATUS },
    { name: 'Device Type', cmd: VTR_COMMANDS.DEVICE_TYPE }
  ];
  
  for (const statusCmd of statusCommands) {
    console.log(`\n📊 Trying ${statusCmd.name}...`);
    try {
      const response = await sendCommand(path, statusCmd.cmd, 3000);
      if (response && response.length > 0) {
        console.log(`✅ ${statusCmd.name} successful!`);
        console.log(`📥 Response: ${response.toString('hex')}`);
        
        // Try to parse the response
        try {
          const status = await getVtrStatus(path);
          console.log(`📼 Timecode: ${status.timecode}`);
          console.log(`⚡ Mode: ${status.mode.toUpperCase()}`);
          console.log(`🏃 Speed: ${status.speed}`);
          console.log(`💾 Tape: ${status.tape ? 'IN' : 'OUT'}`);
          return status;
        } catch (parseError) {
          console.log(`⚠️  Response received but parsing failed: ${parseError.message}`);
        }
        break;
      }
    } catch (error) {
      console.log(`❌ ${statusCmd.name} failed: ${error.message}`);
    }
  }
  
  return null;
}

/**
 * Raw communication test - send any hex command
 */
async function sendRawCommand(path, hexString) {
  console.log(`🔧 Sending raw command: ${hexString}`);
  
  try {
    const buffer = Buffer.from(hexString.replace(/\s/g, ''), 'hex');
    console.log(`📤 Command bytes: ${buffer.toString('hex')}`);
    
    const response = await sendCommand(path, buffer, 3000);
    
    if (response && response.length > 0) {
      console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
      console.log(`📝 ASCII: "${response.toString('ascii').replace(/[^\x20-\x7E]/g, '.')}"}`);
      return response;
    } else {
      console.log(`⚠️  No response received`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Raw command failed: ${error.message}`);
    return null;
  }
}

/**
 * Try to establish proper VTR communication and remote control
 */
async function establishRemoteControl(path) {
  console.log(`🔗 Attempting to establish remote control on ${path}...`);
  
  // Step 1: Try basic local disable command
  console.log('\n1️⃣ Disabling local control...');
  try {
    const response1 = await sendCommand(path, VTR_COMMANDS.LOCAL_DISABLE, 2000);
    console.log(`📥 Local Disable Response: ${response1.toString('hex')}`);
    analyzeResponse(response1, 'Local Disable');
    
    // Wait a moment for the command to take effect
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.log(`❌ Local disable failed: ${error.message}`);
  }
  
  // Step 2: Try alternative local disable commands
  const alternativeCommands = [
    { name: 'Local Disable Alt 1', cmd: Buffer.from([0x88, 0x01, 0x0C, 0x01, 0xFF]) },
    { name: 'Local Disable Alt 2', cmd: Buffer.from([0x88, 0x01, 0x0C, 0x02, 0xFF]) },
    { name: 'Remote Enable', cmd: Buffer.from([0x88, 0x01, 0x11, 0x01, 0xFF]) }
  ];
  
  for (const alt of alternativeCommands) {
    console.log(`\n📡 Trying ${alt.name}...`);
    try {
      const response = await sendCommand(path, alt.cmd, 2000);
      console.log(`📥 Response: ${response.toString('hex')}`);
      analyzeResponse(response, alt.name);
      
      if (response[0] === 0x10) { // ACK response
        console.log(`✅ ${alt.name} successful!`);
        break;
      }
    } catch (error) {
      console.log(`❌ ${alt.name} failed: ${error.message}`);
    }
  }
  
  // Step 3: Test if status command now works
  console.log('\n3️⃣ Testing status after remote control setup...');
  try {
    const statusResponse = await sendCommand(path, VTR_COMMANDS.STATUS, 3000);
    console.log(`📥 Status Response: ${statusResponse.toString('hex')}`);
    
    if (statusResponse[0] !== 0x11) {
      console.log(`✅ Remote control established! VTR is now responding to commands.`);
      return true;
    } else {
      console.log(`⚠️ Still getting NAK - VTR may need manual REMOTE button press`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Status test failed: ${error.message}`);
    return false;
  }
}

/**
 * Manual troubleshooting guide
 */
function showTroubleshootingGuide() {
  console.log('\n🔧 VTR Troubleshooting Guide');
  console.log('============================');
  console.log('\nThe VTR is responding with NAK (0x11) which typically means:');
  console.log('\n1️⃣ LOCAL Mode Issue (Most Common):');
  console.log('   • Look for REMOTE/LOCAL button on VTR front panel');
  console.log('   • Press REMOTE button to enable serial control');
  console.log('   • Some VTRs have a LOCAL/REMOTE switch instead');
  console.log('   • Check VTR display - should show "REMOTE" indicator');
  
  console.log('\n2️⃣ No Tape Loaded:');
  console.log('   • Insert a tape cartridge');
  console.log('   • Wait for tape to thread (may take 10-30 seconds)');
  console.log('   • VTR should show tape counter/timecode');
  
  console.log('\n3️⃣ Tape Protection:');
  console.log('   • Check if tape has record-protect tab');
  console.log('   • Some commands blocked with protected tapes');
  
  console.log('\n4️⃣ VTR Menu Settings:');
  console.log('   • Check VTR setup menu for "Remote Control" settings');
  console.log('   • Verify serial control is enabled');
  console.log('   • Check if specific control protocol is selected');
  
  console.log('\n5️⃣ Cable/Connection:');
  console.log('   • Verify RS-422 cable connections');
  console.log('   • Check TX+/TX- and RX+/RX- wiring');
  console.log('   • Try different cable if available');
  
  console.log('\n💡 Next Steps:');
  console.log('   1. Press REMOTE button on VTR front panel');
  console.log('   2. Insert a tape if none is loaded');
  console.log('   3. Run: node tests/check_vtr_status.js --raw /dev/ttyRP9 "88 01 61 20 FF"');
  console.log('   4. If still NAK, check VTR menu settings');
}

/**
 * Test VTR model-specific command variations
 */
async function testModelVariants(path) {
  console.log(`🎬 Testing VTR model-specific commands on ${path}...`);
  
  const variants = [
    // Try commands with different device IDs in the command
    { name: 'Device ID 0x00', cmd: Buffer.from([0x00, 0x61, 0x61]) },
    { name: 'Device ID 0x10', cmd: Buffer.from([0x10, 0x61, 0x71]) },
    { name: 'Device ID 0x20', cmd: Buffer.from([0x20, 0x61, 0x41]) },
    { name: 'Device ID 0x30', cmd: Buffer.from([0x30, 0x61, 0x51]) },
    
    // HDW-specific variants
    { name: 'HDW Status A', cmd: Buffer.from([0x61, 0x0A, 0x6B]) },
    { name: 'HDW Status B', cmd: Buffer.from([0x62, 0x20, 0x42]) },
    
    // DVW-specific variants  
    { name: 'DVW Status', cmd: Buffer.from([0x60, 0x20, 0x40]) },
    { name: 'DVW Device', cmd: Buffer.from([0x01, 0x11, 0x10]) },
    
    // BVW legacy variants
    { name: 'BVW Ping', cmd: Buffer.from([0x01, 0x01]) },
    { name: 'BVW Status', cmd: Buffer.from([0x02, 0x02]) },
    
    // Try reversed byte order
    { name: 'Reversed Status', cmd: Buffer.from([0x20, 0x61, 0x41]) },
    
    // Try commands without parameters
    { name: 'Status Only', cmd: Buffer.from([0x61]) },
    { name: 'Device Only', cmd: Buffer.from([0x00]) },
    
    // Try with different start bytes
    { name: 'Alt Start 1', cmd: Buffer.from([0x02, 0x61, 0x63]) },
    { name: 'Alt Start 2', cmd: Buffer.from([0x12, 0x61, 0x73]) }
  ];
  
  let workingCommands = 0;
  
  for (const variant of variants) {
    console.log(`\n📡 Testing ${variant.name}...`);
    console.log(`   Command: ${variant.cmd.toString('hex')}`);
    
    try {
      const response = await sendCommand(path, variant.cmd, 2000);
      if (response && response.length > 0) {
        console.log(`   ✅ Response: ${response.toString('hex')} (${response.length} bytes)`);
        analyzeResponse(response, variant.name);
        
        if (response[0] === 0x10) {
          console.log(`   🎯 SUCCESS! ${variant.name} worked!`);
          workingCommands++;
          return variant; // Return first working variant
        } else if (response[0] !== 0x11) {
          console.log(`   📊 Different response - potential data!`);
        }
      } else {
        console.log(`   ⚠️  No response`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`\n📊 Model Variant Test Results: ${workingCommands} successful commands`);
  return workingCommands > 0 ? true : null;
}

// Update the interactiveCheck function to include extended status testing
async function interactiveCheck() {
  const args = process.argv.slice(2);
  
  console.log('🎬 VTR Status Checker & Controller');
  console.log('==================================');
  
  if (args.length === 0) {
    await scanAllVtrs();
  } else if (args[0] === '--help' || args[0] === '-h') {
    console.log('\nUsage:');
    console.log('  node tests/check_vtr_status.js --extendedstatus /dev/ttyRP0  # Test extended status commands');
    console.log('  node tests/check_vtr_status.js --checksum /dev/ttyRP0       # Test commands with proper checksums');
    console.log('  node tests/check_vtr_status.js                    # Scan all ports');
    console.log('  node tests/check_vtr_status.js /dev/ttyRP0        # Check specific port');
    console.log('  node tests/check_vtr_status.js --enhanced /dev/ttyRP0  # Enhanced check with diagnostics');
    console.log('  node tests/check_vtr_status.js --diagnose /dev/ttyRP0  # Full diagnostic check');
    console.log('  node tests/check_vtr_status.js --remote /dev/ttyRP0    # Try to establish remote control');
    console.log('  node tests/check_vtr_status.js --alternative /dev/ttyRP0  # Test alternative command formats');
    console.log('  node tests/check_vtr_status.js --notape /dev/ttyRP0    # Test commands that work without tape');
    console.log('  node tests/check_vtr_status.js --tapestatus /dev/ttyRP0 # Check if tape is loaded');
    console.log('  node tests/check_vtr_status.js --menuhelp             # Show VTR menu settings guide');
    console.log('  node tests/check_vtr_status.js --troubleshoot          # Show troubleshooting guide');
    console.log('  node tests/check_vtr_status.js --raw /dev/ttyRP0 "88 01 61 FF"  # Send raw hex command');
    console.log('  node tests/check_vtr_status.js --control /dev/ttyRP0  # Control VTR');
    console.log('  node tests/check_vtr_status.js --play /dev/ttyRP0     # Send play command');
    console.log('  node tests/check_vtr_status.js --pause /dev/ttyRP0    # Send pause command');
    console.log('  node tests/check_vtr_status.js --stop /dev/ttyRP0     # Send stop command');
    console.log('  node tests/check_vtr_status.js --batch play port1 port2  # Batch control');
    console.log('  node tests/check_vtr_status.js --list             # List all possible ports');
    console.log('  node tests/check_vtr_status.js --monitor /dev/ttyRP0  # Monitor VTR');
    console.log('  node tests/check_vtr_status.js --test /dev/ttyRP0     # Test commands');
    
  } else if (args[0] === '--extendedstatus' || args[0] === '-ext') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --extendedstatus /dev/ttyRP0');
      return;
    }
    await testExtendedStatus(port);
    
  } else if (args[0] === '--checksum' || args[0] === '-cs') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --checksum /dev/ttyRP0');
      return;
    }
    await testChecksumCommands(port);
    
  } else if (args[0] === '--alternative' || args[0] === '-alt') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --alternative /dev/ttyRP0');
      return;
    }
    await testAlternativeCommands(port);
    
  } else if (args[0] === '--menuhelp' || args[0] === '-menu') {
    showVtrMenuGuide();
    
  } else if (args[0] === '--notape' || args[0] === '-nt') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --notape /dev/ttyRP0');
      return;
    }
    await testNoTapeCommands(port);
    
  } else if (args[0] === '--tapestatus' || args[0] === '-ts') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --tapestatus /dev/ttyRP0');
      return;
    }
    await checkTapeStatus(port);
    
  } else if (args[0] === '--remote' || args[0] === '-rem') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --remote /dev/ttyRP0');
      return;
    }
    await establishRemoteControl(port);
    
  } else if (args[0] === '--troubleshoot' || args[0] === '-tr') {
    showTroubleshootingGuide();
    
  } else if (args[0] === '--enhanced' || args[0] === '-e') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --enhanced /dev/ttyRP0');
      return;
    }
    await checkSingleVtrEnhanced(port);
    
  } else if (args[0] === '--diagnose' || args[0] === '-d') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --diagnose /dev/ttyRP0');
      return;
    }
    await diagnosticCheck(port);
    
  } else if (args[0] === '--raw' || args[0] === '-r') {
    const port = args[1];
    const hexCommand = args[2];
    if (!port || !hexCommand) {
      console.log('❌ Usage: --raw /dev/ttyRP0 "88 01 61 FF"');
      return;
    }
    await sendRawCommand(port, hexCommand);
    
  } else if (args[0] === '--control' || args[0] === '-c') {
    const port = args[1] || VTR_PORTS[0];
    await controlVtr(port);
    
  } else if (args[0] === '--play') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --play /dev/ttyRP0');
      return;
    }
    await playVtr(port);
    
  } else if (args[0] === '--pause') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --pause /dev/ttyRP0');
      return;
    }
    await pauseVtr(port);
    
  } else if (args[0] === '--stop') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --stop /dev/ttyRP0');
      return;
    }
    await stopVtr(port);
    
  } else if (args[0] === '--batch') {
    const command = args[1];
    const ports = args.slice(2);
    if (!command || ports.length === 0) {
      console.log('❌ Usage: --batch <command> <port1> [port2] ...');
      console.log('   Commands: play, pause, stop, ff, rew');
      return;
    }
    await batchControlVtrs(ports, command);
    
  } else if (args[0] === '--list' || args[0] === '-l') {
    console.log('\n📍 Available VTR ports:');
    VTR_PORTS.forEach((port, index) => {
      console.log(`   ${index + 1}. ${port}`);
    });
    
  } else {
    const targetPort = args[0];
    
    if (!VTR_PORTS.includes(targetPort)) {
      console.log(`⚠️  Warning: ${targetPort} is not in the standard VTR port list`);
      console.log('   Checking anyway...');
    }
    
    await checkSingleVtr(targetPort);
  }
}

// Continuous monitoring mode
async function monitorVtr(path, interval = 2000) {
  console.log(`📡 Monitoring VTR at ${path} (${interval}ms intervals)`);
  console.log('Press Ctrl+C to stop\n');
  
  let lastStatus = null;
  
  const monitor = async () => {
    try {
      const status = await getVtrStatus(path);
      
      // Only log if status changed
      if (!lastStatus || 
          lastStatus.timecode !== status.timecode ||
          lastStatus.mode !== status.mode ||
          lastStatus.speed !== status.speed ||
          lastStatus.tape !== status.tape) {
        
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] TC:${status.timecode} ${status.mode.toUpperCase()} ${status.speed} ${status.tape ? 'TAPE' : 'NO-TAPE'}`);
        lastStatus = status;
      }
      
    } catch (error) {
      console.log(`[${new Date().toLocaleTimeString()}] ❌ ${error.message}`);
    }
  };
  
  // Initial check
  await monitor();
  
  // Set up interval
  const intervalId = setInterval(monitor, interval);
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log('\n👋 Monitoring stopped');
    process.exit(0);
  });
}

/**
 * Test commands that should work without tape loaded
 */
async function testNoTapeCommands(path) {
  console.log(`🔧 Testing commands that work without tape on ${path}...`);
  
  const noTapeCommands = [
    { name: 'Device Type Request', cmd: Buffer.from([0x88, 0x01, 0x00, 0xFF]) },
    { name: 'Status Request (Simple)', cmd: Buffer.from([0x88, 0x01, 0x61, 0xFF]) },
    { name: 'Local Disable', cmd: Buffer.from([0x88, 0x01, 0x0C, 0xFF]) },
    { name: 'Timer Request', cmd: Buffer.from([0x88, 0x01, 0x71, 0x20, 0xFF]) },
    { name: 'Signal Control Status', cmd: Buffer.from([0x88, 0x01, 0x6A, 0x20, 0xFF]) }
  ];
  
  let workingCommands = 0;
  
  for (const test of noTapeCommands) {
    console.log(`\n📡 Testing ${test.name}...`);
    console.log(`   Command: ${test.cmd.toString('hex')}`);
