// src/commands/vtr_interface.js

const { SerialPort } = require('serialport');
const { parseStatusData, parseExtendedStatus } = require('./vtr_status_parser');
const { autoScanFlexicarts } = require('./flexicart_interface');

// Paths to all possible VTR serial ports
const VTR_PORTS = Array.from({ length: 16 }, (_, i) => `/dev/ttyRP${i}`);
const VTR_BAUD = 38400;
const CMD_TIMEOUT = 100; // ms

/**
 * Send a Sony VTR command buffer, gather response, then close port.
 * @param {SerialPort} port - SerialPort instance
 * @param {Buffer} commandBuffer - Command to send as buffer
 * @returns {Promise<Buffer>} Response buffer
 */
function sendCommandBuffer(port, commandBuffer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const cleanup = () => {
      port.removeAllListeners('data');
      process.removeListener('SIGINT', sigintHandler);
    };
    const sigintHandler = () => {
      cleanup();
      if (port.isOpen) port.close(() => process.exit());
      else process.exit();
    };
    process.once('SIGINT', sigintHandler);

    port.open(err => {
      if (err) { cleanup(); return reject(err); }
      port.write(commandBuffer, err => {
        if (err) { cleanup(); return reject(err); }
        port.drain(() => {
          port.on('data', chunk => chunks.push(chunk));
          setTimeout(() => {
            port.close(() => {
              cleanup();
              resolve(Buffer.concat(chunks));
            });
          }, CMD_TIMEOUT);
        });
      });
    });
  });
}

/**
 * Send command to VTR and wait for response
 * @param {string} path - Serial port path
 * @param {string|Buffer} command - Command to send
 * @param {number} timeout - Timeout in milliseconds (default: 5000)
 * @returns {Promise<Buffer>} Response buffer
 */
async function sendCommand(path, command, timeout = 5000) {
  if (!path || typeof path !== 'string') {
    throw new Error('Invalid port path provided');
  }
  
  if (!command) {
    throw new Error('Invalid command provided');
  }

  return new Promise((resolve, reject) => {
    let port = null;
    let timeoutHandle = null;
    let isResolved = false;

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (port && port.isOpen) {
        port.close((err) => {
          if (err) console.error('Error closing port:', err);
        });
      }
    };

    const safeResolve = (value) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve(value);
      }
    };

    const safeReject = (error) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        reject(error);
      }
    };

    try {
      port = new SerialPort({
        path,
        baudRate: VTR_BAUD,
        dataBits: 8,
        stopBits: 1,
        parity: 'odd',
        autoOpen: false,
        xon: false,
        xoff: false,
        rtscts: false,      // Hardware flow control off
        xany: false
      });

      timeoutHandle = setTimeout(() => {
        safeReject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      port.on('open', () => {
        try {
          // Handle both string and buffer commands
          const commandData = Buffer.isBuffer(command) ? command : Buffer.from(command + '\r\n');
          port.write(commandData);
        } catch (writeError) {
          safeReject(new Error(`Failed to write command: ${writeError.message}`));
        }
      });

      port.on('data', (data) => {
        safeResolve(data);
      });

      port.on('error', (error) => {
        safeReject(new Error(`Port error: ${error.message}`));
      });

      port.open((openError) => {
        if (openError) {
          safeReject(new Error(`Failed to open port: ${openError.message}`));
        }
      });

    } catch (error) {
      safeReject(new Error(`Setup error: ${error.message}`));
    }
  });
}

/**
 * Get VTR status from specified port
 * @param {string} path - Serial port path
 * @returns {Promise<Object>} VTR status object
 * @throws {Error} If path is invalid or communication fails
 */
async function getVtrStatus(path) {
  try {
    // Instead of using status query, send a transport command and interpret the response
    // Use STOP command to get current transport status
    const response = await sendCommand(path, Buffer.from([0x20, 0x00, 0x20]), 3000);
    
    if (!response || response.length === 0) {
      return { error: 'No response from VTR', mode: 'UNKNOWN', timecode: '00:00:00:00', tape: false };
    }
    
    // Parse HDW transport responses
    let mode = 'UNKNOWN';
    let tape = true; // Your VTR shows tape is likely IN based on responses
    let timecode = '00:00:00:00'; // HDW doesn't provide timecode in basic status
    
    // Interpret transport response patterns
    const responseHex = response.toString('hex');
    
    if (responseHex.startsWith('f77e')) {
      // f7 7e xx pattern = STOP mode
      mode = 'STOP';
    } else if (responseHex.startsWith('d7bd')) {
      // d7 bd pattern = PLAY mode  
      mode = 'PLAY';
    } else if (responseHex.startsWith('f79f')) {
      // f7 9f pattern = FAST FORWARD mode
      mode = 'FAST_FORWARD';
    } else if (responseHex.startsWith('f7f7')) {
      // f7 f7 pattern = REWIND mode
      mode = 'REWIND';
    } else if (responseHex.startsWith('6f77')) {
      // 6f 77 pattern = JOG FORWARD mode
      mode = 'JOG_FORWARD';
    } else if (responseHex.startsWith('6f6f')) {
      // 6f 6f pattern = JOG REVERSE mode
      mode = 'JOG_REVERSE';
    }
    
    // For HDW VTRs, tape presence is indicated by getting responses to commands
    // If we get valid responses, tape is likely present and VTR is ready
    tape = response.length > 0;
    
    return {
      mode,
      timecode,
      tape,
      speed: '1x',
      raw: response,
      responseHex: responseHex
    };
    
  } catch (error) {
    return { 
      error: error.message, 
      mode: 'ERROR', 
      timecode: '00:00:00:00', 
      tape: false 
    };
  }
}

/**
 * Enhanced HDW status detection
 */
async function getHdwTransportStatus(path) {
  try {
    // Send a harmless status command and interpret response
    const response = await sendCommand(path, Buffer.from([0x61, 0x20, 0x41]), 3000);
    
    // Your HDW always returns cf d7 00 for status queries
    // So we need to use the last transport command response instead
    
    // Store the last transport command response globally
    if (global.lastTransportResponse) {
      const lastResponse = global.lastTransportResponse;
      const responseHex = lastResponse.toString('hex');
      
      let mode = 'STOP'; // Default
      
      if (responseHex.startsWith('d7bd')) {
        mode = 'PLAY';
      } else if (responseHex.startsWith('f79f')) {
        mode = 'FAST_FORWARD';
      } else if (responseHex.startsWith('f7f7')) {
        mode = 'REWIND';
      } else if (responseHex.startsWith('6f77')) {
        mode = 'JOG_FORWARD';
      } else if (responseHex.startsWith('6f6f')) {
        mode = 'JOG_REVERSE';
      }
      
      return {
        mode,
        timecode: '00:00:00:00', // HDW doesn't provide timecode in basic responses
        tape: true, // VTR responds = tape present
        speed: '1x',
        raw: lastResponse
      };
    }
    
    // Fallback to basic status
    return {
      mode: 'STOP',
      timecode: '00:00:00:00',
      tape: true,
      speed: '1x',
      raw: response
    };
    
  } catch (error) {
    return { 
      error: error.message, 
      mode: 'ERROR', 
      timecode: '00:00:00:00', 
      tape: false 
    };
  }
}

/**
 * Perform an autoscan of all known VTR port paths and return detected units.
 * @returns {Promise<Array>} Array of detected VTR units
 */
async function autoScanVtrs() {
  const results = [];
  for (const path of VTR_PORTS) {
    try {
      const info = await getVtrStatus(path);
      if (info && !info.error) {
        results.push({ path, ...info });
      }
    } catch {
      // port inactive or not a VTR - silently continue
    }
  }
  return results;
}

/**
 * Build a SerialPort object for Sony VTR communications.
 * @param {string} path - Serial port path
 * @returns {SerialPort} Configured SerialPort instance
 */
function openPort(path) {
  return new SerialPort({
    path,
    baudRate: VTR_BAUD,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    autoOpen: false
  });
}

/**
 * Turn raw status bits into a human-readable string.
 * @param {Object} main - Main status object
 * @param {Object} ext - Extended status object
 * @returns {string} Human-readable status string
 */
function humanizeStatus(main, ext) {
  const parts = [];
  if (main.isRecording)      parts.push('REC');
  else if (main.isPlaying)   parts.push('PLAY');
  else                        parts.push('STOP');

  if (main.isInEEMode)       parts.push('E-E');
  if (ext && ext.hoursOperated) parts.push(`${ext.hoursOperated}h run`);

  return parts.join(' • ');
}

/**
 * Register a VTR port for real-time monitoring
 * @param {string} id - Port identifier
 * @param {SerialPort} port - SerialPort instance
 */
function registerPortForMonitoring(id, port) {
  port.on('error', err => console.error(`VTR[${id}] serial error:`, err.message));
  port.on('data', data => {
    // Handle incoming unsolicited frames
    try {
      const status = parseStatusData(data);
      console.log(`VTR[${id}] status update:`, humanizeStatus(status, {}));
    } catch (error) {
      console.debug(`VTR[${id}] parse error:`, error.message);
    }
  });
}

/**
 * Register a VTR port by testing connection
 * @param {string} path - Serial port path
 * @returns {Promise<boolean>} Success status
 * @throws {Error} If registration fails
 */
async function registerPort(path) {
  if (!path || typeof path !== 'string') {
    throw new Error('Invalid port path provided');
  }

  try {
    // Test connection first
    await getVtrStatus(path);
    
    // Add to registered ports (implement storage logic here)
    console.log(`Port ${path} registered successfully`);
    return true;
  } catch (error) {
    throw new Error(`Failed to register port ${path}: ${error.message}`);
  }
}

// Update sendVtrCommand to store last transport response
async function sendVtrCommand(path, command, commandName) {
  console.log(`📤 Sending ${commandName} command to ${path}...`);
  
  try {
    const response = await sendCommand(path, command, 3000);
    
    if (response && response.length > 0) {
      console.log(`✅ ${commandName} command sent successfully`);
      console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
      
      // Store last transport response globally for status detection
      global.lastTransportResponse = response;
      global.lastTransportCommand = commandName;
      global.lastTransportTime = Date.now();
      
      // Interpret the response to determine actual mode
      const responseHex = response.toString('hex');
      let detectedMode = 'UNKNOWN';
      
      if (responseHex.startsWith('f77e')) {
        detectedMode = 'STOP';
      } else if (responseHex.startsWith('d7bd')) {
        detectedMode = 'PLAY';
      } else if (responseHex.startsWith('f79f')) {
        detectedMode = 'FAST_FORWARD';
      } else if (responseHex.startsWith('f7f7')) {
        detectedMode = 'REWIND';
      } else if (responseHex.startsWith('6f77')) {
        detectedMode = 'JOG_FORWARD';
      } else if (responseHex.startsWith('6f6f')) {
        detectedMode = 'JOG_REVERSE';
      }
      
      console.log(`📊 New status: ${detectedMode} - TC: 00:00:00:00`);
      
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

module.exports = {
  autoScanVtrs,
  autoScanFlexicarts,
  getVtrStatus,
  openPort,
  sendCommand,
  sendCommandBuffer,
  registerPort,
  registerPortForMonitoring,
  humanizeStatus,
  VTR_PORTS,
  parseStatusData,
  sendVtrCommand // Export the new function
};
