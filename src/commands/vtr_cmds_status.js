const { sendCommand } = require('./vtr_interface');

/**
 * VTR Status Error class for status-specific errors
 */
class VtrStatusError extends Error {
  constructor(message, code, path) {
    super(message);
    this.name = 'VtrStatusError';
    this.code = code;
    this.path = path;
  }
}

/**
 * Sony 9-pin Status Commands
 */
const VTR_STATUS_COMMANDS = {
  // Basic status commands
  STATUS: Buffer.from([0x61, 0x20, 0x41]),         // STATUS ✅
  DEVICE_TYPE: Buffer.from([0x00, 0x11, 0x11]),    // DEVICE TYPE ✅
  EXTENDED_STATUS: Buffer.from([0x60, 0x20, 0x40]), // Extended status
  FULL_STATUS: Buffer.from([0x63, 0x20, 0x43]),    // Full status block
  
  // System commands
  LOCAL_DISABLE: Buffer.from([0x00, 0x0C, 0x0C]),  // LOCAL DISABLE ✅
  LOCAL_ENABLE: Buffer.from([0x00, 0x1D, 0x1D]),   // LOCAL ENABLE
  
  // Position and counter commands
  HDW_POSITION: Buffer.from([0x71, 0x20, 0x51]),   // Position data
  SEARCH_DATA: Buffer.from([0x72, 0x20, 0x52]),    // Search position
  
  // Alternative status formats
  STATUS_SIMPLE: Buffer.from([0x61]),               // Simple status
  STATUS_2BYTE: Buffer.from([0x61, 0x20]),          // 2-byte status
  STATUS_FRAMED: Buffer.from([0x02, 0x61, 0x20, 0x41, 0x03]) // Framed format
};

/**
 * Device type mapping for Sony 9-pin protocol
 */
const DEVICE_TYPES = {
  0xBA: 'HDW Series VTR',     // Your VTR responds with 0xBA
  0x10: 'BVW Series',
  0x20: 'DVW Series', 
  0x30: 'HDW Series',
  0x40: 'J Series',
  0x50: 'MSW Series',
  0x60: 'DSR Series',
  0x70: 'PDW Series'
};

/**
 * VTR response patterns for status interpretation
 */
const VTR_STATUS_PATTERNS = {
  'f77e': 'STOP',
  'd7bd': 'PLAY',
  'f79f': 'FAST_FORWARD', 
  'f7f7': 'REWIND',
  '6f77': 'JOG_FORWARD',
  '6f6f': 'JOG_REVERSE'
};

/**
 * Interpret VTR status response hex string to determine mode
 * @param {string} responseHex - Hex string response
 * @returns {string} Detected mode
 */
function interpretVtrStatusResponse(responseHex) {
  for (const [pattern, mode] of Object.entries(VTR_STATUS_PATTERNS)) {
    if (responseHex.startsWith(pattern)) {
      // Special case for JOG_STILL detection
      if (pattern === '6f77' && responseHex.includes('3e')) {
        return 'JOG_STILL';
      }
      return mode;
    }
  }
  return 'UNKNOWN';
}

/**
 * Enhanced response analysis function
 * @param {Buffer} response - Response buffer from VTR
 * @param {string} commandName - Name of the command that generated this response
 */
function analyzeResponse(response, commandName) {
  if (!response || response.length === 0) {
    console.log(`📊 ${commandName} Analysis: No response`);
    return { valid: false, error: 'No response' };
  }
  
  const hex = response.toString('hex');
  const bytes = Array.from(response);
  
  console.log(`📊 ${commandName} Response Analysis:`);
  console.log(`   Hex: ${hex}`);
  console.log(`   Length: ${response.length} bytes`);
  console.log(`   Bytes: [${bytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);
  
  // Try to interpret common response patterns
  const mode = interpretVtrStatusResponse(hex);
  console.log(`   🎯 Pattern: ${mode} mode detected`);
  
  return {
    valid: true,
    hex,
    bytes,
    mode,
    length: response.length
  };
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
    mode: 'UNKNOWN',
    tape: false,
    speed: '1x',
    direction: 'FORWARD'
  };
  
  if (includeRaw) {
    status.raw = hex;
    status.bytes = bytes;
  }
  
  // Interpret mode from response pattern
  status.mode = interpretVtrStatusResponse(hex);
  
  // Try to detect tape presence (VTR-specific logic)
  if (bytes.length >= 2) {
    // This is VTR-specific - may need adjustment for your model
    const statusByte = bytes[1];
    status.tape = (statusByte & 0x01) !== 0; // Bit 0 often indicates tape presence
  }
  
  return status;
}

/**
 * Get device type from VTR
 * @param {string} path - VTR port path
 * @returns {Promise<string>} Device type name
 */
async function getDeviceType(path) {
  console.log(`🔍 Getting device type from ${path}...`);
  
  try {
    const response = await sendCommand(path, VTR_STATUS_COMMANDS.DEVICE_TYPE, 3000);
    console.log(`📥 Device Type Response: ${response.toString('hex')}`);
    
    // Parse device type response
    if (response.length >= 3) {
      const deviceId = response[0];   // First byte is device ID
      const subType = response[1];    // Second byte is sub-type
      const version = response[2];    // Third byte is version
      
      console.log(`📺 Device ID: 0x${deviceId.toString(16)} (${deviceId})`);
      console.log(`📺 Sub-type: 0x${subType.toString(16)} (${subType})`);
      console.log(`📺 Version: 0x${version.toString(16)} (${version})`);
      
      const deviceName = DEVICE_TYPES[deviceId] || `Unknown (0x${deviceId.toString(16)})`;
      console.log(`📺 Device Type: ${deviceName}`);
      return deviceName;
    }
    
    return 'Unknown';
  } catch (error) {
    console.log(`❌ Device type check failed: ${error.message}`);
    throw new VtrStatusError(`Device type check failed: ${error.message}`, 'DEVICE_TYPE_FAILED', path);
  }
}

/**
 * Get extended status from VTR
 * @param {string} path - VTR port path
 * @returns {Promise<Buffer>} Extended status response
 */
async function getExtendedStatus(path) {
  console.log(`📊 Getting extended status from ${path}...`);
  
  try {
    const response = await sendCommand(path, VTR_STATUS_COMMANDS.EXTENDED_STATUS, 3000);
    console.log(`📥 Extended Status Response: ${response.toString('hex')}`);
    
    if (response && response.length > 0) {
      analyzeResponse(response, 'Extended Status');
      return response;
    } else {
      throw new VtrStatusError('No extended status response', 'NO_RESPONSE', path);
    }
  } catch (error) {
    console.log(`❌ Extended status failed: ${error.message}`);
    throw new VtrStatusError(`Extended status failed: ${error.message}`, 'EXTENDED_STATUS_FAILED', path);
  }
}

/**
 * Get VTR status (non-destructive method)
 * @param {string} path - VTR port path
 * @returns {Promise<Object>} Status object
 */
async function getVtrStatusNonDestructive(path) {
  try {
    const response = await sendCommand(path, VTR_STATUS_COMMANDS.STATUS, 3000);
    
    if (!response || response.length === 0) {
      return { error: 'No response from VTR' };
    }
    
    const status = decodeVtrStatusResponse(response);
    
    // Use working LTC timecode function
    try {
      const ltcResponse = await sendCommand(path, Buffer.from([0x78, 0x20, 0x58]), 1000);
      if (ltcResponse && ltcResponse.length >= 3) {
        // Decode using packed format (your working method)
        const bytes = Array.from(ltcResponse);
        const packed = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
        const frames = packed & 0x3F;
        const seconds = (packed >> 6) & 0x3F;
        const minutes = (packed >> 12) & 0x3F;
        const hours = (packed >> 18) & 0x1F;
        
        if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
          const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
          status.timecode = timecode;
        } else {
          status.timecode = 'TC:NO_DECODE';
        }
      } else {
        status.timecode = 'TC:NO_RESPONSE';
      }
    } catch (e) {
      status.timecode = 'TC:ERROR';
    }
    
    return status;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Check single VTR status with working timecode
 * @param {string} path - VTR port path
 * @returns {Promise<Object|null>} VTR status object or null if failed
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
    
    console.log(`✅ VTR Found!`);
    console.log(`   📼 Timecode: ${status.timecode}`);
    console.log(`   ⚡ Mode: ${status.mode.toUpperCase()}`);
    console.log(`   🏃 Speed: ${status.speed}`);
    console.log(`   💾 Tape: ${status.tape ? 'IN' : 'OUT'}`);
    
    return status;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return null;
  }
}

/**
 * Enhanced single VTR check with detailed analysis
 * @param {string} path - VTR port path
 * @returns {Promise<Object|null>} Enhanced VTR status object or null if failed
 */
async function checkSingleVtrEnhanced(path) {
  console.log(`\n🔍 Enhanced VTR check at ${path}...`);
  
  try {
    // Get basic status
    const status = await getVtrStatusNonDestructive(path);
    
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
    try {
      await getDeviceType(path);
    } catch (e) {
      console.log(`⚠️  Device type check failed: ${e.message}`);
    }
    
    // Get extended status
    try {
      await getExtendedStatus(path);
    } catch (e) {
      console.log(`⚠️  Extended status check failed: ${e.message}`);
    }
    
    return status;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return null;
  }
}

/**
 * Debug status responses with detailed analysis
 * @param {string} path - VTR port path
 */
async function debugStatusResponses(path) {
  console.log(`🔍 Debug status responses for ${path}...\n`);
  
  const statusCommands = [
    { name: 'Basic Status', cmd: VTR_STATUS_COMMANDS.STATUS },
    { name: 'Device Type', cmd: VTR_STATUS_COMMANDS.DEVICE_TYPE },
    { name: 'Extended Status', cmd: VTR_STATUS_COMMANDS.EXTENDED_STATUS },
    { name: 'Full Status', cmd: VTR_STATUS_COMMANDS.FULL_STATUS },
    { name: 'HDW Position', cmd: VTR_STATUS_COMMANDS.HDW_POSITION },
    { name: 'Search Data', cmd: VTR_STATUS_COMMANDS.SEARCH_DATA }
  ];
  
  for (const statusCmd of statusCommands) {
    try {
      console.log(`📤 Testing ${statusCmd.name}...`);
      const response = await sendCommand(path, statusCmd.cmd, 3000);
      
      if (response && response.length > 0) {
        const analysis = analyzeResponse(response, statusCmd.name);
        
        // Additional interpretation for specific commands
        if (statusCmd.name === 'Device Type' && response.length >= 1) {
          const deviceId = response[0];
          const deviceName = DEVICE_TYPES[deviceId] || `Unknown (0x${deviceId.toString(16)})`;
          console.log(`   📺 Interpreted: ${deviceName}`);
        }
        
        if (statusCmd.name === 'Basic Status') {
          const decoded = decodeVtrStatusResponse(response);
          console.log(`   📊 Mode: ${decoded.mode}`);
          console.log(`   📊 Tape: ${decoded.tape ? 'IN' : 'OUT'}`);
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
 * Test communication with VTR using status commands
 * @param {string} path - VTR port path
 */
async function testCommunication(path) {
  console.log(`🧪 Testing communication with ${path}...`);
  
  const tests = [
    { name: 'Device Type', cmd: VTR_STATUS_COMMANDS.DEVICE_TYPE },
    { name: 'Status', cmd: VTR_STATUS_COMMANDS.STATUS },
    { name: 'Extended Status', cmd: VTR_STATUS_COMMANDS.EXTENDED_STATUS }
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
 * @param {string} path - VTR port path
 */
async function testNoTapeCommands(path) {
  console.log(`🧪 Testing no-tape commands on ${path}...`);
  
  const commands = [
    { name: 'Local Disable', cmd: VTR_STATUS_COMMANDS.LOCAL_DISABLE },
    { name: 'Status', cmd: VTR_STATUS_COMMANDS.STATUS },
    { name: 'Device Type', cmd: VTR_STATUS_COMMANDS.DEVICE_TYPE }
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
 * Test alternative status command formats
 * @param {string} path - VTR port path
 */
async function testAlternativeCommands(path) {
  console.log(`🧪 Testing alternative status command formats on ${path}...`);
  
  const alternatives = [
    { name: 'Simple Status', cmd: VTR_STATUS_COMMANDS.STATUS_SIMPLE },
    { name: '2-byte Status', cmd: VTR_STATUS_COMMANDS.STATUS_2BYTE },
    { name: '3-byte Status', cmd: VTR_STATUS_COMMANDS.STATUS },
    { name: 'Framed Status', cmd: VTR_STATUS_COMMANDS.STATUS_FRAMED }
  ];
  
  for (const alt of alternatives) {
    try {
      console.log(`📤 Testing ${alt.name}...`);
      const response = await sendCommand(path, alt.cmd, 3000);
      console.log(`✅ ${alt.name}: ${response.toString('hex')}`);
      analyzeResponse(response, alt.name);
    } catch (error) {
      console.log(`❌ ${alt.name}: ${error.message}`);
    }
  }
}

/**
 * Test extended status commands
 * @param {string} path - VTR port path
 */
async function testExtendedStatus(path) {
  console.log(`🧪 Testing extended status on ${path}...`);
  
  const statusCommands = [
    { name: 'Basic Status', cmd: VTR_STATUS_COMMANDS.STATUS },
    { name: 'Extended Status', cmd: VTR_STATUS_COMMANDS.EXTENDED_STATUS },
    { name: 'Full Status', cmd: VTR_STATUS_COMMANDS.FULL_STATUS }
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
 * @param {string} path - VTR port path
 * @returns {Promise<boolean>} True if tape is present
 */
async function checkTapeStatus(path) {
  console.log(`🧪 Checking tape status on ${path}...`);
  
  try {
    const status = await getVtrStatusNonDestructive(path);
    
    if (status.error) {
      console.log(`❌ Tape status check failed: ${status.error}`);
      return false;
    }
    
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
 * Establish remote control
 * @param {string} path - VTR port path
 * @returns {Promise<boolean>} True if remote control established
 */
async function establishRemoteControl(path) {
  console.log(`🎛️ Establishing remote control on ${path}...`);
  
  try {
    console.log('📤 Sending LOCAL DISABLE command...');
    const response = await sendCommand(path, VTR_STATUS_COMMANDS.LOCAL_DISABLE, 3000);
    console.log(`✅ Local disable response: ${response.toString('hex')}`);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Test if remote control is working
    console.log('📤 Testing remote control with status command...');
    const status = await getVtrStatusNonDestructive(path);
    
    if (!status.error) {
      console.log(`✅ Remote control established - Mode: ${status.mode.toUpperCase()}`);
      return true;
    } else {
      console.log(`⚠️  Remote control status unclear: ${status.error}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Failed to establish remote control: ${error.message}`);
    return false;
  }
}

/**
 * Get command buffer for a given status command name
 * @param {string} commandName - Name of the command
 * @returns {Buffer|null} Command buffer or null if not found
 */
function getCommandBuffer(commandName) {
  const upperName = commandName.toUpperCase();
  
  if (VTR_STATUS_COMMANDS[upperName]) {
    return VTR_STATUS_COMMANDS[upperName];
  }
  
  return null;
}

/**
 * Monitor VTR status continuously
 * @param {string} path - VTR port path
 * @param {number} intervalMs - Monitoring interval in milliseconds
 */
async function monitorVtr(path, intervalMs = 1000) {
  console.log(`🔄 Monitoring VTR at ${path} (${intervalMs}ms interval)...`);
  console.log('Press Ctrl+C to stop monitoring');
  
  const monitor = async () => {
    try {
      const status = await getVtrStatusNonDestructive(path);
      const timestamp = new Date().toLocaleTimeString();
      
      if (!status.error) {
        console.log(`[${timestamp}] ${status.mode.toUpperCase()} - TC: ${status.timecode} - Tape: ${status.tape ? 'IN' : 'OUT'}`);
      } else {
        console.log(`[${timestamp}] ❌ Error: ${status.error}`);
      }
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
 * Detect exact VTR model and capabilities
 * @param {string} path - VTR port path
 * @returns {Promise<Object>} VTR model information
 */
async function detectVtrModel(path) {
  console.log(`🔍 Detecting VTR model at ${path}...`);
  
  const modelInfo = {
    manufacturer: 'Sony',
    series: 'Unknown',
    model: 'Unknown',
    capabilities: [],
    deviceId: null,
    version: null,
    supportedCommands: []
  };
  
  try {
    // Get device type response
    console.log('📤 Requesting device type...');
    const deviceResponse = await sendCommand(path, VTR_STATUS_COMMANDS.DEVICE_TYPE, 3000);
    
    if (deviceResponse && deviceResponse.length >= 3) {
      const deviceId = deviceResponse[0];
      const subType = deviceResponse[1];
      const version = deviceResponse[2];
      
      modelInfo.deviceId = deviceId;
      modelInfo.version = version;
      
      console.log(`📺 Device ID: 0x${deviceId.toString(16).padStart(2, '0')} (${deviceId})`);
      console.log(`📺 Sub-type: 0x${subType.toString(16).padStart(2, '0')} (${subType})`);
      console.log(`📺 Version: 0x${version.toString(16).padStart(2, '0')} (${version})`);
      
      // Enhanced model detection based on device responses
      if (deviceId === 0x20) {
        modelInfo.series = 'BVW Series';
        modelInfo.model = 'BVW-75/65 Betacam SP';
        modelInfo.capabilities = [
          'Sony 9-pin RS-422 Control',
          'Betacam SP Recording',
          'Component Video I/O',
          'Timecode Support',
          'Remote Control'
        ];
      } else if (deviceId === 0x21) {
        modelInfo.series = 'BVW Series';
        modelInfo.model = 'BVW-40/35 Betacam SP';
        modelInfo.capabilities = [
          'Sony 9-pin RS-422 Control',
          'Betacam SP Recording',
          'Basic Transport Control'
        ];
      } else if (deviceId === 0x22) {
        modelInfo.series = 'UVW Series';
        modelInfo.model = 'UVW-1800/1400 Betacam SP';
        modelInfo.capabilities = [
          'Sony 9-pin RS-422 Control',
          'Betacam SP Recording',
          'Digital I/O',
          'Timecode Support'
        ];
      } else if (deviceId >= 0x40 && deviceId <= 0x4F) {
        modelInfo.series = 'DVW Series';
        modelInfo.model = 'DVW-500/700 Digital Betacam';
        modelInfo.capabilities = [
          'Sony 9-pin RS-422 Control',
          'Digital Betacam Recording',
          'Component Video I/O',
          'Digital Audio',
          'Advanced Timecode Support'
        ];
      } else if (deviceId >= 0x50 && deviceId <= 0x5F) {
        modelInfo.series = 'HDW Series';
        modelInfo.model = 'HDW-500/700/2000 HDCAM';
        modelInfo.capabilities = [
          'Sony 9-pin RS-422 Control',
          'HDCAM Recording',
          'HD Component Video I/O',
          'Digital Audio',
          'Advanced Servo Control',
          'Variable Speed Playback'
        ];
      } else if (deviceId >= 0x60 && deviceId <= 0x6F) {
        modelInfo.series = 'PDW Series';
        modelInfo.model = 'PDW-1500/510P XDCAM';
        modelInfo.capabilities = [
          'Sony 9-pin RS-422 Control',
          'XDCAM Recording',
          'Professional Disc',
          'Multiple Format Support'
        ];
      } else if (deviceId >= 0xBA && deviceId <= 0xBF) {
        modelInfo.series = 'HDW Series';
        if (subType === 0xBA && version === 0xBA) {
          modelInfo.model = 'HDW-M2000/M2100 Series';
          modelInfo.capabilities = [
            'Sony 9-pin RS-422 Control',
            'Digital Betacam Recording',
            'Multi-format Support',
            'Advanced Servo Control',
            'Comprehensive Timecode Support',
            'Variable Speed Playback',
            'Digital I/O'
          ];
        } else {
          modelInfo.model = 'HDW Series Professional';
          modelInfo.capabilities = [
            'Sony 9-pin RS-422 Control',
            'Professional Recording',
            'Advanced Transport Control'
          ];
        }
      } else {
        // Handle unknown device types
        const deviceName = DEVICE_TYPES[deviceId] || `Unknown Device (0x${deviceId.toString(16)})`;
        modelInfo.series = deviceName;
        modelInfo.model = deviceName;
        modelInfo.capabilities = [
          'Sony 9-pin RS-422 Control',
          'Basic Transport Control'
        ];
      }
    } else {
      console.log('⚠️  No device type response - testing basic commands...');
      
      // Try basic status to confirm it's a VTR
      const statusResponse = await sendCommand(path, VTR_STATUS_COMMANDS.STATUS, 3000);
      if (statusResponse && statusResponse.length > 0) {
        modelInfo.model = 'Sony VTR (Model Unknown)';
        modelInfo.capabilities = [
          'Sony 9-pin RS-422 Control',
          'Basic Status Support'
        ];
      } else {
        throw new Error('No valid VTR response received');
      }
    }
    
    // Test supported commands
    console.log('📤 Testing command support...');
    const supportedCommands = await testCommandSupport(path);
    modelInfo.supportedCommands = supportedCommands;
    
    // Get extended status for more details
    try {
      console.log('📤 Getting extended status...');
      const extResponse = await sendCommand(path, VTR_STATUS_COMMANDS.EXTENDED_STATUS, 3000);
      if (extResponse && extResponse.length > 0) {
        console.log(`📊 Extended status available: ${extResponse.toString('hex')}`);
        modelInfo.capabilities.push('Extended Status Support');
      }
    } catch (e) {
      console.log('⚠️  Extended status not supported');
    }
    
    // Display detected model info
    console.log('\n🎯 VTR MODEL DETECTED:');
    console.log(`📺 Manufacturer: ${modelInfo.manufacturer}`);
    console.log(`📺 Series: ${modelInfo.series}`);
    console.log(`📺 Model: ${modelInfo.model}`);
    console.log(`📺 Device ID: 0x${modelInfo.deviceId?.toString(16).padStart(2, '0') || 'Unknown'}`);
    console.log(`📺 Version: 0x${modelInfo.version?.toString(16).padStart(2, '0') || 'Unknown'}`);
    
    if (modelInfo.capabilities.length > 0) {
      console.log(`🔧 Capabilities:`);
      modelInfo.capabilities.forEach(cap => {
        console.log(`   • ${cap}`);
      });
    }
    
    if (modelInfo.supportedCommands.length > 0) {
      console.log(`📋 Supported Commands: ${modelInfo.supportedCommands.join(', ')}`);
    }
    
    return modelInfo;
    
  } catch (error) {
    console.log(`❌ Model detection failed: ${error.message}`);
    modelInfo.model = 'Detection Failed';
    modelInfo.capabilities = ['Error: ' + error.message];
    return modelInfo;
  }
}

/**
 * Test which commands are supported by the VTR
 * @param {string} path - VTR port path
 * @returns {Promise<Array>} Array of supported command names
 */
async function testCommandSupport(path) {
  const commandTests = [
    { name: 'Basic Status', cmd: VTR_STATUS_COMMANDS.STATUS },
    { name: 'Device Type', cmd: VTR_STATUS_COMMANDS.DEVICE_TYPE },
    { name: 'Extended Status', cmd: VTR_STATUS_COMMANDS.EXTENDED_STATUS },
    { name: 'Local Disable', cmd: VTR_STATUS_COMMANDS.LOCAL_DISABLE }
  ];
  
  const supported = [];
  
  for (const test of commandTests) {
    try {
      const response = await sendCommand(path, test.cmd, 1000);
      if (response && response.length > 0) {
        supported.push(test.name);
      }
    } catch (e) {
      // Command not supported or failed
    }
  }
  
  return supported;
}

module.exports = {
  // Status command functions
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
  
  // Status utilities
  analyzeResponse,
  decodeVtrStatusResponse,
  interpretVtrStatusResponse,
  getCommandBuffer,
  
  // Status constants
  VTR_STATUS_COMMANDS,
  DEVICE_TYPES,
  VTR_STATUS_PATTERNS,
  
  // Error class
  VtrStatusError,
  
  // Model detection functions
  detectVtrModel,
  testCommandSupport
};