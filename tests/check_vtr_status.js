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

// Update VTR_COMMANDS with working 4-byte JOG commands
const VTR_COMMANDS = {
  // Device Control Commands (CMD1=20) - Working ✅
  STOP: Buffer.from([0x20, 0x00, 0x20]),           // STOP ✅
  PLAY: Buffer.from([0x20, 0x01, 0x21]),           // PLAY ✅
  FAST_FORWARD: Buffer.from([0x20, 0x10, 0x30]),   // FAST FWD ✅
  REWIND: Buffer.from([0x20, 0x20, 0x40]),         // REWIND ✅
  
  // Variable speed commands (4-byte format) - WORKING! ✅
  JOG_FORWARD_STILL: Buffer.from([0x21, 0x11, 0x00, 0x30]),     // JOG FWD STILL ✅
  JOG_FORWARD_SLOW: Buffer.from([0x21, 0x11, 0x20, 0x10]),      // JOG FWD SLOW ✅
  JOG_FORWARD_NORMAL: Buffer.from([0x21, 0x11, 0x40, 0x30]),    // JOG FWD NORMAL ✅
  
  JOG_REVERSE_SLOW: Buffer.from([0x21, 0x21, 0x20, 0x00]),      // JOG REV SLOW ✅
  JOG_REVERSE_NORMAL: Buffer.from([0x21, 0x21, 0x40, 0x20]),    // JOG REV NORMAL ✅
  
  // System Commands - Working ✅
  LOCAL_DISABLE: Buffer.from([0x00, 0x0C, 0x0C]),  // LOCAL DISABLE ✅
  DEVICE_TYPE: Buffer.from([0x00, 0x11, 0x11]),    // DEVICE TYPE ✅
  LOCAL_ENABLE: Buffer.from([0x00, 0x1D, 0x1D]),   // LOCAL ENABLE
  
  // Status Commands - Working ✅
  STATUS: Buffer.from([0x61, 0x20, 0x41]),         // STATUS ✅
  TIMECODE: Buffer.from([0x74, 0x20, 0x54]),       // TIMECODE
  EXTENDED_STATUS: Buffer.from([0x61, 0x20, 0x41]) // STATUS ✅
};

// Also update VTR_COMMANDS_CORRECTED
// Fix VTR_COMMANDS_CORRECTED - Remove RECORD (20-02)
const VTR_COMMANDS_CORRECTED = {
  // CORRECT Sony 9-pin transport commands (NO RECORD 20-02, NO PAUSE for standard HDW)
  PLAY: Buffer.from([0x20, 0x01, 0x21]),           // PLAY with checksum ✅
  STOP: Buffer.from([0x20, 0x00, 0x20]),           // STOP with checksum ✅
  // RECORD: REMOVED - 20-02 is RECORD which we're avoiding
  // PAUSE: NOT SUPPORTED on standard HDW series (only HDW-S280)
  FAST_FORWARD: Buffer.from([0x20, 0x10, 0x30]),   // FF with checksum ✅
  REWIND: Buffer.from([0x20, 0x20, 0x40]),         // REW with checksum ✅
  STANDBY_OFF: Buffer.from([0x20, 0x04, 0x24]),    // STANDBY OFF (NOT RECORD!)
  STANDBY_ON: Buffer.from([0x20, 0x05, 0x25]),     // STANDBY ON
  
  // Status commands (confirmed working)
  STATUS: Buffer.from([0x61, 0x20, 0x41]),         // Status with data request ✅
  DEVICE_TYPE: Buffer.from([0x00, 0x11, 0x11]),    // Device type request ✅
  TIMECODE: Buffer.from([0x74, 0x20, 0x54]),       // Timecode request ✅
  TAPE_TIMER: Buffer.from([0x75, 0x20, 0x55]),     // Tape timer
  
  // Control commands
  LOCAL_DISABLE: Buffer.from([0x00, 0x0C, 0x0C]),  // 00-0C Local disable ✅
  LOCAL_ENABLE: Buffer.from([0x00, 0x1D, 0x1D])    // 00-1D Local enable
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
 * Pause command - NOT AVAILABLE on standard HDW series
 * @param {string} path - VTR port path
 */
async function pauseVtr(path) {
  console.log('⚠️  PAUSE command is NOT supported on standard HDW series VTRs');
  console.log('💡 PAUSE is only available on HDW-S280 model');
  console.log('🔄 Use STOP command instead for standard HDW series');
  
  // For standard HDW, use STOP instead of PAUSE
  console.log('📤 Sending STOP command as alternative...');
  return await sendVtrCommand(path, VTR_COMMANDS.STOP, 'STOP (PAUSE not available)');
}

/**
 * Stop command
 * @param {string} path - VTR port path
 */
async function stopVtr(path) {
  return await sendVtrCommand(path, Buffer.from([0x20, 0x00, 0x20]), 'STOP');
}

/**
 * Record command - DISABLED (20-02 is RECORD, which we're avoiding)
 * @param {string} path - VTR port path
 */
async function recordVtr(path) {
  console.log('⚠️  RECORD command is DISABLED');
  console.log('💡 Note: RECORD is 20-02 which you requested to avoid');
  console.log('🚫 This function will not send any command to prevent accidental recording');
  
  // DO NOT send any command - just log and return
  return false;
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
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_FORWARD_SLOW, 'JOG FORWARD SLOW');
}

async function jogReverse(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_REVERSE_SLOW, 'JOG REVERSE SLOW');
}

async function jogForwardFast(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_FORWARD_NORMAL, 'JOG FORWARD NORMAL');
}

async function jogReverseFast(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_REVERSE_NORMAL, 'JOG REVERSE NORMAL');
}

async function jogStill(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_FORWARD_STILL, 'JOG STILL');
}

async function shuttlePlus1(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.SHUTTLE_FORWARD_1X, 'SHUTTLE +1x');
}

async function shuttleMinus1(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.SHUTTLE_REVERSE_1X, 'SHUTTLE -1x');
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

// Fix getDeviceType function - correct response parsing
async function getDeviceType(path) {
  console.log(`🔍 Getting device type from ${path}...`);
  
  try {
    const response = await sendCommand(path, VTR_COMMANDS.DEVICE_TYPE, 3000);
    console.log(`📥 Device Type Response: ${response.toString('hex')}`);
    
    // Parse device type response - CORRECTED parsing
    if (response.length >= 3) {
      const deviceId = response[0];   // First byte is device ID
      const subType = response[1];    // Second byte is sub-type
      const version = response[2];    // Third byte is version
      
      console.log(`📺 Device ID: 0x${deviceId.toString(16)} (${deviceId})`);
      console.log(`📺 Sub-type: 0x${subType.toString(16)} (${subType})`);
      console.log(`📺 Version: 0x${version.toString(16)} (${version}`);
      
      const deviceTypes = {
        0xBA: 'HDW Series VTR',     // Your VTR responds with 0xBA
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
 * Enhanced single VTR check with detailed analysis
 */
async function checkSingleVtrEnhanced(path) {
  console.log(`\n🔍 Enhanced VTR check at ${path}...`);
  
  try {
    // Get basic status
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
    
    // Get device type
    await getDeviceType(path);
    
    // Get extended status
    await getExtendedStatus(path);
    
    return status;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return null;
  }
}

/**
 * Monitor VTR status continuously
 */
async function monitorVtr(path, intervalMs = 1000) {
  console.log(`🔄 Monitoring VTR at ${path} (${intervalMs}ms interval)...`);
  console.log('Press Ctrl+C to stop monitoring');
  
  const monitor = async () => {
    try {
      const status = await getVtrStatus(path);
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ${status.mode.toUpperCase()} - TC: ${status.timecode} - Tape: ${status.tape ? 'IN' : 'OUT'}`);
    } catch (error) {
      console.log(`[${new Date().toLocaleTimeString()}] ❌ Error: ${error.message}`);
    }
  };
  
  // Initial check
  await monitor();
  
  // Set up interval
  const interval = setInterval(monitor, intervalMs);
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n👋 Monitoring stopped');
    process.exit(0);
  });
}

/**
 * Test communication with VTR
 */
async function testCommunication(path) {
  console.log(`🧪 Testing communication with ${path}...`);
  
  const tests = [
    { name: 'Device Type', cmd: VTR_COMMANDS.DEVICE_TYPE },
    { name: 'Status', cmd: VTR_COMMANDS.STATUS },
    { name: 'Timecode', cmd: VTR_COMMANDS.TIMECODE }
  ];
  
  for (const test of tests) {
    try {
      console.log(`📤 Testing ${test.name}...`);
      const response = await sendCommand(path, test.cmd, 3000);
      console.log(`✅ ${test.name}: ${response.toString('hex')} (${response.length} bytes)`);
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
    }
  }
}

/**
 * Test commands that don't require tape
 */
async function testNoTapeCommands(path) {
  console.log(`🧪 Testing no-tape commands on ${path}...`);
  
  const commands = [
    { name: 'Local Disable', cmd: VTR_COMMANDS.LOCAL_DISABLE },
    { name: 'Status', cmd: VTR_COMMANDS.STATUS },
    { name: 'Device Type', cmd: VTR_COMMANDS.DEVICE_TYPE }
  ];
  
  for (const cmd of commands) {
    try {
      console.log(`📤 Testing ${cmd.name}...`);
      const response = await sendCommand(path, cmd.cmd, 3000);
      console.log(`✅ ${cmd.name}: ${response.toString('hex')}`);
    } catch (error) {
      console.log(`❌ ${cmd.name}: ${error.message}`);
    }
  }
}

/**
 * Test alternative command formats
 */
async function testAlternativeCommands(path) {
  console.log(`🧪 Testing alternative command formats on ${path}...`);
  
  const alternatives = [
    { name: 'Simple Status', cmd: Buffer.from([0x61]) },
    { name: '2-byte Status', cmd: Buffer.from([0x61, 0x20]) },
    { name: '3-byte Status', cmd: Buffer.from([0x61, 0x20, 0x41]) }
  ];
  
  for (const alt of alternatives) {
    try {
      console.log(`📤 Testing ${alt.name}...`);
      const response = await sendCommand(path, alt.cmd, 3000);
      console.log(`✅ ${alt.name}: ${response.toString('hex')}`);
    } catch (error) {
      console.log(`❌ ${alt.name}: ${error.message}`);
    }
  }
}

/**
 * Test checksum command formats
 */
async function testChecksumCommands(path) {
  console.log(`🧪 Testing checksum commands on ${path}...`);
  
  const commands = [
    { name: 'Play with checksum', cmd: VTR_COMMANDS.PLAY },
    { name: 'Stop with checksum', cmd: VTR_COMMANDS.STOP },
    { name: 'Status with checksum', cmd: VTR_COMMANDS.STATUS }
  ];
  
  for (const cmd of commands) {
    try {
      console.log(`📤 Testing ${cmd.name}...`);
      const response = await sendCommand(path, cmd.cmd, 3000);
      console.log(`✅ ${cmd.name}: ${response.toString('hex')}`);
    } catch (error) {
      console.log(`❌ ${cmd.name}: ${error.message}`);
    }
  }
}

/**
 * Test extended status commands
 */
async function testExtendedStatus(path) {
  console.log(`🧪 Testing extended status on ${path}...`);
  
  const statusCommands = [
    { name: 'Basic Status', cmd: Buffer.from([0x61, 0x20, 0x41]) },
    { name: 'Timecode Status', cmd: Buffer.from([0x74, 0x20, 0x54]) },
    { name: 'Timer Status', cmd: Buffer.from([0x75, 0x20, 0x55]) }
  ];
  
  for (const cmd of statusCommands) {
    try {
      console.log(`📤 Testing ${cmd.name}...`);
      const response = await sendCommand(path, cmd.cmd, 3000);
      console.log(`✅ ${cmd.name}: ${response.toString('hex')}`);
      analyzeResponse(response, cmd.name);
    } catch (error) {
      console.log(`❌ ${cmd.name}: ${error.message}`);
    }
  }
}

/**
 * Check tape status
 */
async function checkTapeStatus(path) {
  console.log(`🧪 Checking tape status on ${path}...`);
  
  try {
    const status = await getVtrStatus(path);
    console.log(`💾 Tape Status: ${status.tape ? 'IN' : 'OUT'}`);
    
    if (status.tape) {
      console.log(`📼 Timecode: ${status.timecode}`);
      console.log(`⚡ Mode: ${status.mode.toUpperCase()}`);
    }
    
    return status.tape;
  } catch (error) {
    console.log(`❌ Tape status check failed: ${error.message}`);
    return false;
  }
}

/**
 * Diagnostic check
 */
async function diagnosticCheck(path) {
  console.log(`🩺 Running diagnostic check on ${path}...`);
  
  console.log('\n1. Basic Communication Test...');
  await testCommunication(path);
  
  console.log('\n2. Device Type Check...');
  await getDeviceType(path);
  
  console.log('\n3. Status Check...');
  await checkSingleVtr(path);
  
  console.log('\n4. Extended Status Test...');
  await testExtendedStatus(path);
  
  console.log('\n5. Transport Command Test...');
  await testVtrCommands(path);
  
  console.log('\n🩺 Diagnostic complete');
}

/**
 * Establish remote control
 */
async function establishRemoteControl(path) {
  console.log(`🎛️ Establishing remote control on ${path}...`);
  
  try {
    console.log('📤 Sending LOCAL DISABLE command...');
    const response = await sendCommand(path, VTR_COMMANDS.LOCAL_DISABLE, 3000);
    console.log(`✅ Local disable response: ${response.toString('hex')}`);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Test if remote control is working
    console.log('📤 Testing remote control with status command...');
    const status = await getVtrStatus(path);
    console.log(`✅ Remote control established - Mode: ${status.mode.toUpperCase()}`);
    
    return true;
  } catch (error) {
    console.log(`❌ Failed to establish remote control: ${error.message}`);
    return false;
  }
}

/**
 * Show troubleshooting guide
 */
function showTroubleshootingGuide() {
  console.log('\n🔧 VTR Troubleshooting Guide');
  console.log('============================');
  console.log('\n📋 Common Issues:');
  console.log('1. No response from VTR:');
  console.log('   - Check power and cable connections');
  console.log('   - Verify baud rate (9600/38400)');
  console.log('   - Ensure VTR is in remote mode');
  console.log('\n2. Commands not working:');
  console.log('   - Send LOCAL DISABLE command first');
  console.log('   - Check if tape is loaded (for transport commands)');
  console.log('   - Verify command format and checksum');
  console.log('\n3. Incorrect status data:');
  console.log('   - Different VTR models use different protocols');
  console.log('   - Try alternative command formats');
  console.log('   - Check Sony protocol documentation');
}

/**
 * Show VTR menu guide
 */
function showVtrMenuGuide() {
  console.log('\n📺 VTR Menu Configuration Guide');
  console.log('===============================');
  console.log('\n🔧 Required VTR Settings:');
  console.log('1. Remote Control: ON/ENABLE');
  console.log('2. Serial Protocol: Sony 9-pin');
  console.log('3. Baud Rate: 38400 (or 9600)');
  console.log('4. Data Bits: 8');
  console.log('5. Parity: ODD');
  console.log('6. Stop Bits: 1');
  console.log('\n📋 Menu Navigation:');
  console.log('- Access SETUP or CONFIG menu');
  console.log('- Look for REMOTE, SERIAL, or COMM settings');
  console.log('- Enable remote control');
  console.log('- Set protocol to Sony 9-pin');
}

/**
 * Diagnose menu issue
 */
async function diagnoseMenuIssue(path) {
  console.log(`🩺 Diagnosing menu issue on ${path}...`);
  
  console.log('\n1. Testing basic communication...');
  await testCommunication(path);
  
  console.log('\n2. Trying to establish remote control...');
  await establishRemoteControl(path);
  
  console.log('\n3. Testing transport commands...');
  const commands = ['PLAY', 'STOP']; // Remove 'PAUSE' for standard HDW
  for (const cmd of commands) {
    try {
      const cmdBuffer = VTR_COMMANDS[cmd];
      if (cmdBuffer) {
        console.log(`📤 Testing ${cmd}...`);
        const response = await sendCommand(path, cmdBuffer, 3000);
        console.log(`✅ ${cmd}: ${response.toString('hex')}`);
      }
    } catch (error) {
      console.log(`❌ ${cmd}: ${error.message}`);
    }
  }
  
  console.log('\n📋 If commands still don\'t work:');
  showVtrMenuGuide();
}

/**
 * Test model variants
 */
async function testModelVariants(path) {
  console.log(`🧪 Testing model variants on ${path}...`);
  
  const variants = [
    { name: 'HDW Standard', deviceCmd: Buffer.from([0x00, 0x11, 0x11]) },
    { name: 'BVW Standard', deviceCmd: Buffer.from([0x00, 0x10, 0x10]) },
    { name: 'DVW Standard', deviceCmd: Buffer.from([0x00, 0x20, 0x20]) }
  ];
  
  for (const variant of variants) {
    try {
      console.log(`📤 Testing ${variant.name}...`);
      const response = await sendCommand(path, variant.deviceCmd, 3000);
      console.log(`✅ ${variant.name}: ${response.toString('hex')}`);
    } catch (error) {
      console.log(`❌ ${variant.name}: ${error.message}`);
    }
  }
}

/**
 * Test command formats
 */
async function testCommandFormats(path) {
  console.log(`🧪 Testing command formats on ${path}...`);
  
  const formats = [
    { name: '1-byte format', cmd: Buffer.from([0x61]) },
    { name: '2-byte format', cmd: Buffer.from([0x61, 0x20]) },
    { name: '3-byte format', cmd: Buffer.from([0x61, 0x20, 0x41]) },
    { name: 'Framed format', cmd: Buffer.from([0x02, 0x61, 0x20, 0x41, 0x03]) }
  ];
  
  for (const format of formats) {
    try {
      console.log(`📤 Testing ${format.name}...`);
      const response = await sendCommand(path, format.cmd, 3000);
      console.log(`✅ ${format.name}: ${response.toString('hex')}`);
    } catch (error) {
      console.log(`❌ ${format.name}: ${error.message}`);
    }
  }
}

/**
 * Test simple commands
 */
async function testSimpleCommands(path) {
  console.log(`🧪 Testing simple commands on ${path}...`);
  
  const simple = [
    { name: 'Simple Play', cmd: Buffer.from([0x20]) },
    { name: 'Simple Stop', cmd: Buffer.from([0x2F]) },
    { name: 'Simple Status', cmd: Buffer.from([0x61]) },
    { name: 'Simple Device', cmd: Buffer.from([0x00]) }
  ];
  
  for (const cmd of simple) {
    try {
      console.log(`📤 Testing ${cmd.name}...`);
      const response = await sendCommand(path, cmd.cmd, 3000);
      console.log(`✅ ${cmd.name}: ${response.toString('hex')}`);
    } catch (error) {
      console.log(`❌ ${cmd.name}: ${error.message}`);
    }
  }
}

/**
 * Send raw command to VTR
 * @param {string} path - VTR port path  
 * @param {string} commandString - Hex command string (e.g., "20 01 21")
 */
async function sendRawCommand(path, commandString) {
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
 * Interactive VTR control
 */
async function controlVtr(path) {
  console.log(`🎛️ Interactive VTR Control for ${path}`);
  console.log('=====================================');
  console.log('Commands: play, stop, ff, rew, jog-fwd, jog-rev, jog-still, eject, status, quit');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const prompt = () => {
    rl.question('VTR> ', async (answer) => {
      const cmd = answer.trim().toLowerCase();
      
      try {
        switch (cmd) {
          case 'play':
            await playVtr(path);
            break;
          case 'stop':
            await stopVtr(path);
            break;
          case 'ff':
            await fastForwardVtr(path);
            break;
          case 'rew':
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
          case 'quit':
          case 'exit':
            rl.close();
            return;
          default:
            console.log('Unknown command. Available: play, stop, ff, rew, jog-fwd, jog-rev, jog-still, eject, status, quit');
        }
      } catch (error) {
        console.log(`❌ Command failed: ${error.message}`);
      }
      
      prompt();
    });
  };
  
  prompt();
}

/**
 * Interactive command line interface
 */
async function interactiveCheck() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('🎬 VTR Status Checker & Controller');
    console.log('==================================');
    console.log('Usage:');
    console.log('  node check_vtr_status.js <port>                    # Check single VTR');
    console.log('  node check_vtr_status.js --scan                    # Scan all ports');
    console.log('  node check_vtr_status.js --play <port>             # Send PLAY command');
    console.log('  node check_vtr_status.js --stop <port>             # Send STOP command');
    console.log('  node check_vtr_status.js --pause <port>            # Send PAUSE command');
    console.log('  node check_vtr_status.js --jog-forward <port>      # Send JOG FORWARD command');
    console.log('  node check_vtr_status.js --jog-reverse <port>      # Send JOG REVERSE command');
    console.log('  node check_vtr_status.js --jog-still <port>        # Send JOG STILL command');
    console.log('  node check_vtr_status.js --control <port>          # Interactive control');
    console.log('  node check_vtr_status.js --raw <port> "20 01 21"   # Send raw command');
    return;
  }
  
  const command = args[0];
  const port = args[1];
  const rawCommand = args[2];
  
  console.log('🎬 VTR Status Checker & Controller');
  console.log('==================================');
  
  try {
    switch (command) {
      case '--scan':
        await scanAllVtrs();
        break;
      case '--play':
        if (!port) {
          console.log('❌ Port required for --play');
          return;
        }
        await playVtr(port);
        break;
      case '--stop':
        if (!port) {
          console.log('❌ Port required for --stop');
          return;
        }
        await stopVtr(port);
        break;
      case '--pause':
        if (!port) {
          console.log('❌ Port required for --pause');
          return;
        }
        await pauseVtr(port);
        break;
      case '--jog-forward':
      case '--jog-fwd':
        if (!port) {
          console.log('❌ Port required for --jog-forward');
          return;
        }
        await jogForward(port);
        break;
      case '--jog-reverse':
      case '--jog-rev':
        if (!port) {
          console.log('❌ Port required for --jog-reverse');
          return;
        }
        await jogReverse(port);
        break;
      case '--jog-still':
        if (!port) {
          console.log('❌ Port required for --jog-still');
          return;
        }
        await jogStill(port);
        break;
      case '--jog-fast-forward':
        if (!port) {
          console.log('❌ Port required for --jog-fast-forward');
          return;
        }
        await jogForwardFast(port);
        break;
      case '--jog-fast-reverse':
        if (!port) {
          console.log('❌ Port required for --jog-fast-reverse');
          return;
        }
        await jogReverseFast(port);
        break;
      case '--control':
        if (!port) {
          console.log('❌ Port required for --control');
          return;
        }
        await controlVtr(port);
        break;
      case '--raw':
        if (!port || !rawCommand) {
          console.log('❌ Port and command required for --raw');
          return;
        }
        await sendRawCommand(port, rawCommand);
        break;
      default:
        // Check if it's a port path (not starting with --)
        if (!command.startsWith('--')) {
          await checkSingleVtr(command);
        } else {
          console.log(`❌ Unknown command: ${command}`);
          console.log('Use "node check_vtr_status.js" to see available commands');
        }
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

/**
 * Analyze VTR response
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
  
  // Basic analysis
  if (response.length > 0) {
    const firstByte = response[0];
    console.log(`   🔸 First byte: 0x${firstByte.toString(16)} (${firstByte})`);
    
    if (response.length > 1) {
      const secondByte = response[1];
      console.log(`   🔸 Second byte: 0x${secondByte.toString(16)} (${secondByte})`);
    }
    
    // Determine response type
    if (firstByte >= 0x80) {
      console.log(`   📊 STATUS DATA - Response contains status information`);
    } else if (firstByte === 0x10) {
      console.log(`   ✅ ACK - Command acknowledged`);
    } else if (firstByte === 0x11) {
      console.log(`   ❌ NAK - Command not acknowledged`);
    }
    
    if (response.length > 2) {
      console.log(`   📈 Additional bytes:`);
      for (let i = 2; i < response.length; i++) {
        console.log(`     Byte ${i}: 0x${response[i].toString(16)} (${response[i]})`);
      }
    }
  }
}

/**
 * Decode VTR status responses based on command type
 */
function decodeVtrStatusResponse(response, commandType) {
  if (!response || response.length === 0) return null;
  
  console.log(`🔍 Decoding ${commandType} response:`);
  
  switch(commandType.toLowerCase()) {
    case 'stop':
      if (response.length >= 3) {
        // Based on your "f7 7e f8" response
        const status1 = response[0]; // 0xF7 = Transport status
        const status2 = response[1]; // 0x7E = Mode status  
        const status3 = response[2]; // 0xF8 = Additional status
        
        console.log(`   🛑 Transport Status: 0x${status1.toString(16)} (${status1})`);
        console.log(`   📊 Mode Status: 0x${status2.toString(16)} (${status2})`);
        console.log(`   🎛️  Additional Status: 0x${status3.toString(16)} (${status3})`);
        
        // Decode transport bits (0xF7 = 11110111)
        if (status1 & 0x80) console.log(`     - Status response active`);
        if (status1 & 0x40) console.log(`     - Servo system active`);
        if (status1 & 0x20) console.log(`     - Tape loaded`);
        if (status1 & 0x10) console.log(`     - Transport ready`);
        
        return { mode: 'STOP', transport: status1, modeStatus: status2, additional: status3 };
      }
      break;
      
    case 'play':
      if (response.length >= 2) {
        // Based on your "d7 bd" response
        const status1 = response[0]; // 0xD7 = Transport status
        const status2 = response[1]; // 0xBD = Mode status
        
        console.log(`   🎮 Transport Status: 0x${status1.toString(16)} (${status1})`);
        console.log(`   📊 Mode Status: 0x${status2.toString(16)} (${status2})`);
        
        // Decode transport bits (0xD7 = 11010111)
        if (status1 & 0x80) console.log(`     - Status response active`);
        if (status1 & 0x40) console.log(`     - Play mode indication`);
        if (status1 & 0x20) console.log(`     - Tape loaded`);
        if (status1 & 0x10) console.log(`     - Direction forward`);
        
        return { mode: 'PLAY', transport: status1, modeStatus: status2 };
      }
      break;
      
    case 'device type':
      if (response.length >= 3) {
        // Based on your "ba ba e0" response
        const deviceId = response[0];   // 0xBA = HDW Series
        const subType = response[1];    // 0xBA = Model variant
        const version = response[2];    // 0xE0 = Version info
        
        console.log(`   📺 Device ID: 0x${deviceId.toString(16)} (${deviceId})`);
        console.log(`   📺 Sub-type: 0x${subType.toString(16)} (${subType})`);
        console.log(`   📺 Version: 0x${version.toString(16)} (${version})`);
        
        let deviceName = 'Unknown';
        if (deviceId === 0xBA) {
          deviceName = 'HDW Series VTR (confirmed working)';
        }
        
        console.log(`   📺 Identified as: ${deviceName}`);
        return { deviceId, subType, version, deviceName, raw: response };
      }
      break;
      
    case 'status':
      if (response.length >= 3) {
        // Based on your "cf d7 00" response
        const status1 = response[0]; // 0xCF = Transport status
        const status2 = response[1]; // 0xD7 = Mode status
        const status3 = response[2]; // 0x00 = Additional data
        
        console.log(`   📊 Status Byte 1: 0x${status1.toString(16)} (${status1})`);
        console.log(`   📊 Status Byte 2: 0x${status2.toString(16)} (${status2})`);
        console.log(`   📊 Status Byte 3: 0x${status3.toString(16)} (${status3})`);
        
        return { status1, status2, status3, raw: response };
      }
      break;
      
    case 'jog forward':
    case 'jog reverse':
    case 'jog':
      if (response.length >= 4) {
        // Based on your "6f 77 xx xx" responses
        const status1 = response[0]; // 0x6F = JOG status indicator
        const status2 = response[1]; // 0x77 = Direction/mode
        const status3 = response[2]; // Variable speed data
        const status4 = response[3]; // Additional speed data
        
        console.log(`   🎮 JOG Status 1: 0x${status1.toString(16)} (${status1})`);
        console.log(`   🎮 JOG Status 2: 0x${status2.toString(16)} (${status2})`);
        console.log(`   🎮 Speed Data 1: 0x${status3.toString(16)} (${status3})`);
        console.log(`   🎮 Speed Data 2: 0x${status4.toString(16)} (${status4})`);
        
        // Determine direction from status2
        const direction = status2 === 0x77 ? 'FORWARD' : (status2 === 0x6F ? 'REVERSE' : 'UNKNOWN');
        console.log(`   🎮 JOG Direction: ${direction}`);
        
        return { mode: 'JOG', direction, status1, status2, status3, status4, raw: response };
      }
      break;
  }
  
  return { raw: response };
}

/**
 * Batch control multiple VTRs
 */
async function batchControlVtrs(ports, command) {
  console.log(`🎛️ Sending ${command} to ${ports.length} VTRs...`);
  
  const results = [];
  for (const port of ports) {
    try {
      let result;
      switch (command.toLowerCase()) {
        case 'play':
          result = await playVtr(port);
          break;
        case 'stop':
          result = await stopVtr(port);
          break;
        case 'ff':
        case 'fastforward':
          result = await fastForwardVtr(port);
          break;
        case 'rew':
        case 'rewind':
          result = await rewindVtr(port);
          break;
        // Remove pause and record cases
        default:
          throw new Error(`Unknown command: ${command}. Available: play, stop, ff, rew`);
      }
      results.push({ port, success: result });
    } catch (error) {
      results.push({ port, success: false, error: error.message });
    }
  }
  
  return results;
}

/*
 * Sony 9-pin Variable Speed Data Values:
 * SPEED = 0x00 (0)    = STILL
 * SPEED = 0x20 (32)   = 0.1x normal speed  
 * SPEED = 0x40 (64)   = 1.0x normal speed
 * SPEED = 0x4F (79)   = About 2.9x normal speed
 * 
 * Variable Speed Command Format: [CMD1, CMD2, SPEED, CHECKSUM]
 * Example: JOG FWD slow = [0x21, 0x11, 0x20, 0x10]
 */

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
