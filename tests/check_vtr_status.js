const { autoScanVtrs, getVtrStatus, VTR_PORTS, humanizeStatus, sendCommand } = require('../src/commands/vtr_interface');

// ✅ KEEP - Import transport functions from the new module
const {
  playVtr,                    // ✅ IMPORTED - don't redefine
  pauseVtr,                   // ✅ IMPORTED - don't redefine  
  stopVtr,                    // ✅ IMPORTED - don't redefine
  recordVtr,                  // ✅ IMPORTED - don't redefine
  fastForwardVtr,             // ✅ IMPORTED - don't redefine
  rewindVtr,                  // ✅ IMPORTED - don't redefine
  ejectTape,                  // ✅ IMPORTED - don't redefine
  jogForward,                 // ✅ IMPORTED - don't redefine
  jogReverse,                 // ✅ IMPORTED - don't redefine
  jogForwardFast,             // ✅ IMPORTED - don't redefine
  jogReverseFast,             // ✅ IMPORTED - don't redefine
  jogStill,                   // ✅ IMPORTED - don't redefine
  shuttlePlus1,               // ✅ IMPORTED - don't redefine
  shuttleMinus1,              // ✅ IMPORTED - don't redefine
  testVtrTransportCommands,   // ✅ IMPORTED - don't redefine
  batchControlVtrs,           // ✅ IMPORTED - don't redefine
  sendVtrTransportCommand,    // ✅ IMPORTED - don't redefine
  interpretVtrResponse,       // ✅ IMPORTED - don't redefine
  getStoredTransportState,    // ✅ IMPORTED - don't redefine
  storeTransportState,        // ✅ IMPORTED - don't redefine
  clearTransportState,        // ✅ IMPORTED - don't redefine
  VTR_TRANSPORT_COMMANDS,     // ✅ IMPORTED - don't redefine
  VtrTransportError           // ✅ IMPORTED - don't redefine
} = require('../src/commands/vtr_cmds_transport');

// ✅ KEEP - Helper functions
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
 * Send a transport command to VTR and interpret the response
 * @param {string} path - Serial port path (e.g., '/dev/ttyRP11')
 * @param {Buffer} command - Command buffer to send
 * @param {string} commandName - Human-readable command name for logging
 * @returns {Promise<VtrCommandResult>} Result object with success status and interpreted response
 * @throws {VtrError} When path or command is invalid
 * 
 * @example
 * const result = await sendVtrCommand('/dev/ttyRP11', Buffer.from([0x20, 0x01, 0x21]), 'PLAY');
 * if (result.success) {
 *   console.log(`VTR is now in ${result.mode} mode`);
 * }
 */
async function sendVtrCommand(path, command, commandName) {
  return await sendVtrTransportCommand(path, command, commandName);
}

/**
 * Get extended status from VTR
 * @param {string} path - VTR port path
 */
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
 * Check single VTR status with working timecode
 */
async function checkSingleVtr(path) {
  console.log(`\n🔍 Checking VTR at ${path}...`);
  
  try {
    // Use non-destructive status check
    const status = await getVtrStatusNonDestructive(path);
    
    if (status.error) {
      console.log(`❌ Error: ${status.error}`);
      return null;
    }
    
    // Get actual timecode using working LTC command
    const timecode = await getVtrTimecode(path);
    
    console.log(`✅ VTR Found!`);
    console.log(`   📼 Timecode: ${timecode}`);
    console.log(`   ⚡ Mode: ${status.mode.toUpperCase()}`);
    console.log(`   🏃 Speed: ${status.speed}`);
    console.log(`   💾 Tape: ${status.tape ? 'IN' : 'OUT'}`);
    
    return { ...status, timecode };
    
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
 * Enhanced response analysis function
 * @param {Buffer} response - Response buffer from VTR
 * @param {string} commandName - Name of the command that generated this response
 */
function analyzeResponse(response, commandName) {
  if (!response || response.length === 0) {
    console.log(`📊 ${commandName} Analysis: No response`);
    return;
  }
  
  const hex = response.toString('hex');
  const bytes = Array.from(response);
  
  console.log(`📊 ${commandName} Response Analysis:`);
  console.log(`   Hex: ${hex}`);
  console.log(`   Length: ${response.length} bytes`);
  console.log(`   Bytes: [${bytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);
  
  // Try to interpret common response patterns
  if (hex.startsWith('f77e')) {
    console.log(`   🎯 Pattern: STOP mode detected`);
  } else if (hex.startsWith('d7bd')) {
    console.log(`   🎯 Pattern: PLAY mode detected`);
  } else if (hex.startsWith('f79f')) {
    console.log(`   🎯 Pattern: FAST_FORWARD mode detected`);
  } else if (hex.startsWith('f7f7')) {
    console.log(`   🎯 Pattern: REWIND mode detected`);
  } else if (hex.startsWith('6f')) {
    console.log(`   🎯 Pattern: JOG mode detected`);
  } else {
    console.log(`   ❓ Pattern: Unknown response pattern`);
  }
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
 * Decode VTR status response
 * @param {Buffer} response - Status response buffer
 * @param {Object} options - Options for decoding
 * @param {boolean} options.includeRaw - Include raw hex string in output
 * @returns {Object} Decoded status object
 */
function decodeVtrStatusResponse(response, { includeRaw = true } = {}) {
  if (!response || response.length < 2) {
    return { error: 'Invalid response' };
  }
  
  const bytes = Array.from(response);
  const hex = response.toString('hex');
  
  // Basic status interpretation
  const status = {
    raw: hex,
    bytes: bytes,
    mode: 'UNKNOWN',
    tape: false,
    speed: '1x',
    direction: 'FORWARD'
  };
  
  // Interpret common patterns
  if (hex.startsWith('f77e')) {
    status.mode = 'STOP';
  } else if (hex.startsWith('d7bd')) {
    status.mode = 'PLAY';
  } else if (hex.startsWith('f79f')) {
    status.mode = 'FAST_FORWARD';
  } else if (hex.startsWith('f7f7')) {
    status.mode = 'REWIND';
  } else if (hex.startsWith('6f')) {
    status.mode = 'JOG';
  }
  
  return status;
}

/**
 * Get command buffer for a given command name
 * @param {string} commandName - Name of the command
 * @returns {Buffer|null} Command buffer or null if not found
 */
function getCommandBuffer(commandName) {
  const upperName = commandName.toUpperCase();
  
  if (VTR_COMMANDS[upperName]) {
    return VTR_COMMANDS[upperName];
  }
  
  if (VTR_COMMANDS_CORRECTED[upperName]) {
    return VTR_COMMANDS_CORRECTED[upperName];
  }
  
  return null;
}

/**
 * Get VTR status (non-destructive method)
 * @param {string} path - VTR port path
 * @returns {Promise<Object>} Status object
 */
async function getVtrStatusNonDestructive(path) {
  try {
    const response = await sendCommand(path, Buffer.from([0x61, 0x20, 0x41]), 3000);
    
    if (!response || response.length === 0) {
      return { error: 'No response from VTR' };
    }
    
    const status = decodeVtrStatusResponse(response);
    status.timecode = await getVtrTimecode(path);
    
    return status;
  } catch (error) {
    return { error: error.message };
  }
}

// Export functions for use by other modules
module.exports = {
  checkSingleVtr,
  checkSingleVtrEnhanced,
  scanAllVtrs,
  monitorVtr,
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
  getExtendedStatus,
  getDeviceType,
  controlVtr,
  analyzeResponse,
  diagnoseMenuIssue,
  testModelVariants,
  testCommandFormats,
  testSimpleCommands,
  decodeVtrStatusResponse,
  debugStatusResponses,
  getCommandBuffer,
  // Timecode functions
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
  // ✅ Re-export transport functions from transport module
  ...require('../src/commands/vtr_cmds_transport')
};