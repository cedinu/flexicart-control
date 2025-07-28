const { sendCommand } = require('./vtr_interface');

/**
 * VTR Error class for transport-specific errors
 */
class VtrTransportError extends Error {
  constructor(message, code, path) {
    super(message);
    this.name = 'VtrTransportError';
    this.code = code;
    this.path = path;
  }
}

/**
 * VTR Transport State Manager
 */
class VtrTransportStateManager {
  constructor() {
    this.portStates = new Map();
  }
  
  updateTransportState(path, response, command, timestamp = Date.now()) {
    this.portStates.set(path, {
      lastResponse: response,
      lastCommand: command,
      timestamp,
      mode: interpretVtrResponse(response.toString('hex'))
    });
  }
  
  getPortState(path) {
    return this.portStates.get(path) || null;
  }
  
  clearPortState(path) {
    this.portStates.delete(path);
  }
}

const vtrTransportState = new VtrTransportStateManager();

/**
 * Sony 9-pin Transport Commands
 */
const VTR_TRANSPORT_COMMANDS = {
  // Basic Transport Commands (CMD1=20) - Working ✅
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
  
  // Standby commands (NOT RECORD!)
  STANDBY_OFF: Buffer.from([0x20, 0x04, 0x24]),    // STANDBY OFF (NOT RECORD!)
  STANDBY_ON: Buffer.from([0x20, 0x05, 0x25]),     // STANDBY ON
};

/**
 * Interpret VTR response hex string to determine mode
 * @param {string} responseHex - Hex string response
 * @returns {string} Detected mode
 */
function interpretVtrResponse(responseHex) {
  const VTR_RESPONSE_PATTERNS = {
    'f77e': 'STOP',
    'd7bd': 'PLAY',
    'f79f': 'FAST_FORWARD', 
    'f7f7': 'REWIND',
    '6f77': 'JOG_FORWARD',
    '6f6f': 'JOG_REVERSE'
  };
  
  for (const [pattern, mode] of Object.entries(VTR_RESPONSE_PATTERNS)) {
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
 * Send a transport command to VTR and interpret the response
 * @param {string} path - Serial port path (e.g., '/dev/ttyRP11')
 * @param {Buffer} command - Command buffer to send
 * @param {string} commandName - Human-readable command name for logging
 * @returns {Promise<Object>} Result object with success status and interpreted response
 * @throws {VtrTransportError} When path or command is invalid
 */
async function sendVtrTransportCommand(path, command, commandName) {
  try {
    const response = await sendCommand(path, command, 3000);
    
    if (!response || response.length === 0) {
      throw new VtrTransportError(`No response received for ${commandName}`, 'NO_RESPONSE', path);
    }
    
    // Update state manager
    vtrTransportState.updateTransportState(path, response, commandName);
    
    const mode = interpretVtrResponse(response.toString('hex'));
    console.log(`📤 Sending ${commandName} command to ${path}...`);
    console.log(`✅ ${commandName} command sent successfully`);
    console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
    console.log(`📊 New status: ${mode} - TC: 00:00:00:00`);
    
    return {
      success: true,
      response,
      mode,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    const vtrError = error instanceof VtrTransportError ? error : 
      new VtrTransportError(`${commandName} failed: ${error.message}`, 'COMMAND_FAILED', path);
    
    console.log(`❌ ${vtrError.message}`);
    return {
      success: false,
      error: vtrError,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Play command
 * @param {string} path - VTR port path
 */
async function playVtr(path) {
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.PLAY, 'PLAY');
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
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.STOP, 'STOP (PAUSE not available)');
}

/**
 * Stop command
 * @param {string} path - VTR port path
 */
async function stopVtr(path) {
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.STOP, 'STOP');
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
  return {
    success: false,
    error: 'RECORD command disabled for safety',
    timestamp: new Date().toISOString()
  };
}

/**
 * Fast Forward command
 * @param {string} path - VTR port path
 */
async function fastForwardVtr(path) {
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.FAST_FORWARD, 'FAST FORWARD');
}

/**
 * Rewind command
 * @param {string} path - VTR port path
 */
async function rewindVtr(path) {
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.REWIND, 'REWIND');
}

/**
 * Eject Tape command
 * @param {string} path - VTR port path
 */
async function ejectTape(path) {
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.EJECT || Buffer.from([0x20, 0x0F, 0x2F]), 'EJECT');
}

/**
 * Jog Forward Slow
 * @param {string} path - VTR port path
 */
async function jogForward(path) {
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.JOG_FORWARD_SLOW, 'JOG FORWARD SLOW');
}

/**
 * Jog Reverse Slow
 * @param {string} path - VTR port path
 */
async function jogReverse(path) {
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.JOG_REVERSE_SLOW, 'JOG REVERSE SLOW');
}

/**
 * Jog Forward Fast
 * @param {string} path - VTR port path
 */
async function jogForwardFast(path) {
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.JOG_FORWARD_NORMAL, 'JOG FORWARD NORMAL');
}

/**
 * Jog Reverse Fast
 * @param {string} path - VTR port path
 */
async function jogReverseFast(path) {
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.JOG_REVERSE_NORMAL, 'JOG REVERSE NORMAL');
}

/**
 * Jog Still (stationary jog)
 * @param {string} path - VTR port path
 */
async function jogStill(path) {
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.JOG_FORWARD_STILL, 'JOG STILL');
}

/**
 * Shuttle Plus 1x
 * @param {string} path - VTR port path
 */
async function shuttlePlus1(path) {
  // Use JOG_FORWARD_NORMAL as shuttle equivalent
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.JOG_FORWARD_NORMAL, 'SHUTTLE +1x');
}

/**
 * Shuttle Minus 1x
 * @param {string} path - VTR port path
 */
async function shuttleMinus1(path) {
  // Use JOG_REVERSE_NORMAL as shuttle equivalent
  return await sendVtrTransportCommand(path, VTR_TRANSPORT_COMMANDS.JOG_REVERSE_NORMAL, 'SHUTTLE -1x');
}

/**
 * Test VTR transport commands
 * @param {string} path - VTR port path
 */
async function testVtrTransportCommands(path) {
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
 * Batch control multiple VTRs
 * @param {Array<string>} ports - Array of VTR port paths
 * @param {string} command - Command to send ('play', 'stop', 'ff', 'rew')
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
        default:
          throw new Error(`Unknown command: ${command}. Available: play, stop, ff, rew`);
      }
      results.push({ port, success: result.success, result });
    } catch (error) {
      results.push({ port, success: false, error: error.message });
    }
  }
  
  return results;
}

/**
 * Get stored transport state for a port
 * @param {string} path - VTR port path
 * @returns {Object|null} Transport state or null
 */
function getStoredTransportState(path) {
  return vtrTransportState.getPortState(path);
}

/**
 * Store transport state for a port
 * @param {string} path - VTR port path
 * @param {Buffer} response - Response buffer
 * @param {string} command - Command name
 */
function storeTransportState(path, response, command) {
  vtrTransportState.updateTransportState(path, response, command);
}

/**
 * Clear transport state for a port
 * @param {string} path - VTR port path
 */
function clearTransportState(path) {
  vtrTransportState.clearPortState(path);
}

module.exports = {
  // Transport command functions
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
  
  // Transport testing functions
  testVtrTransportCommands,
  batchControlVtrs,
  
  // Transport utilities
  sendVtrTransportCommand,
  interpretVtrResponse,
  getStoredTransportState,
  storeTransportState,
  clearTransportState,
  
  // Transport constants
  VTR_TRANSPORT_COMMANDS,
  
  // Transport state manager
  vtrTransportState,
  
  // Error class
  VtrTransportError
};