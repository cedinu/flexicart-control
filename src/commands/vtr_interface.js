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
        parity: 'none',
        autoOpen: false
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
  if (!path || typeof path !== 'string') {
    throw new Error('Invalid port path provided');
  }

  try {
    // Send Sony VTR status command (adjust command as needed for your VTR protocol)
    const statusCommand = Buffer.from([0x88, 0x01, 0x61, 0xFF]); // Example Sony protocol
    const buffer = await sendCommand(path, statusCommand);
    return parseStatusData(buffer);
  } catch (error) {
    throw new Error(`Failed to get VTR status: ${error.message}`);
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
  parseStatusData
};
