// src/commands/vtr_interface.js
const { SerialPort } = require('serialport');
const { parseStatusData, parseExtendedStatus } = require('./vtr_status_parser');

const VTR_PORTS = Array.from({ length: 16 }, (_, i) => `/dev/ttyRP${i}`);
const VTR_BAUD  = 38400;
const CMD_TIMEOUT = 100; // ms

function openPort(index) {
  const path = VTR_PORTS[index];
  if (!path) throw new Error(`Invalid VTR port index: ${index}`);
  return new SerialPort({
    path,
    baudRate: VTR_BAUD,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    autoOpen: false
  });
}

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

async function getVtrStatus(id) {
  if (typeof id !== 'number' || id < 0 || id >= VTR_PORTS.length) {
    throw new Error(`Invalid VTR ID: ${id}`);
  }

  // 61.20 full status, 61.21 block0, 61.21 block2, 61.2A hours
  const cmds = [
    Buffer.from([0x61, 0x20, 0x0F]),
    Buffer.from([0x61, 0x21, 0x00 | 0x01]), // block 0
    Buffer.from([0x61, 0x21, 0x02]),        // block 2
    Buffer.from([0x61, 0x2A, 0x0F])
  ];

  const results = [];
  for (const cmd of cmds) {
    const port = openPort(id);
    results.push(await sendCommand(port, cmd));
  }

  const [main, block0, block2, hours] = results;

  return {
    port: VTR_PORTS[id],
    id,
    ...parseStatusData(main.slice(3)),
    ...parseExtendedStatus(block0.slice(3), block2.slice(3), hours.slice(3))
  };
}

async function autoScanVtrs() {
  const found = [];
  for (let i = 0; i < VTR_PORTS.length; i++) {
    try {
      const status = await getVtrStatus(i);
      found.push(status);
    } catch (_e) {
      // no response on this port
    }
  }
  return found;
}

// stub for wiring up live events on an open port
function registerPort(id, port) {
  port.on('error', err => {
    console.error(`VTR[${id}] serial error:`, err.message);
  });
  port.on('data', data => {
    // you can parse real-time incoming status here
    // e.g. vtrInterface.handleIncoming(id, data);
  });
}

module.exports = {
  autoScanVtrs,
  getVtrStatus,
  registerPort
};
