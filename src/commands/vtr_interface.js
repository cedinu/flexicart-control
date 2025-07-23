// src/commands/vtr_interface.js

const { SerialPort } = require('serialport');
const { parseStatusData, parseExtendedStatus } = require('./vtr_status_parser');

// Paths to all possible VTR serial ports
const VTR_PORTS = Array.from({ length: 16 }, (_, i) => `/dev/ttyRP${i}`);
const VTR_BAUD = 38400;
const CMD_TIMEOUT = 100; // ms

/**
 * Send a Sony VTR command buffer, gather response, then close port.
 */
function sendCommand(port, commandBuffer) {
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
 * Query a single VTR for status blocks and return a human-readable summary.
 */
async function getVtrStatus(path) {
  const port = openPort(path);
  const main   = await sendCommand(port, Buffer.from([0x61, 0x20, 0x0F]));
  const block0 = await sendCommand(port, Buffer.from([0x61, 0x21, 0x01]));
  const block2 = await sendCommand(port, Buffer.from([0x61, 0x21, 0x02]));
  const hours  = await sendCommand(port, Buffer.from([0x61, 0x2A, 0x0F]));

  const status = parseStatusData(main.slice(3));
  const ext    = parseExtendedStatus(block0.slice(3), block2.slice(3), hours.slice(3));

  return {
    path,
    model:  status.deviceType,
    status: humanizeStatus(status, ext)
  };
}

/**
 * Perform an autoscan of all known VTR port paths and return detected units.
 */
async function autoScanVtrs() {
  const results = [];
  for (const path of VTR_PORTS) {
    try {
      const info = await getVtrStatus(path);
      results.push(info);
    } catch {
      // port inactive or not a VTR
    }
  }
  return results;
}

/**
 * Build a SerialPort object for Sony VTR communications.
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
 */
function humanizeStatus(main, ext) {
  const parts = [];
  if (main.isRecording)      parts.push('REC');
  else if (main.isPlaying)   parts.push('PLAY');
  else                        parts.push('STOP');

  if (main.isInEEMode)       parts.push('E-E');
  if (ext.hoursOperated)     parts.push(`${ext.hoursOperated}h run`);

  return parts.join(' • ');
}

/**
 * Stub for wiring up real-time listeners on an open port.
 */
function registerPort(id, port) {
  port.on('error', err => console.error(`VTR[${id}] serial error:`, err.message));
  port.on('data',  data => {/* handle incoming unsolicited frames */});
}

module.exports = {
  autoScanVtrs,
  getVtrStatus,
  openPort,
  sendCommand,
  registerPort,
  humanizeStatus
};
