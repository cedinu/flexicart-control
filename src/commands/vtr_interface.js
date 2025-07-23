// src/commands/vtr_interface.js
import { SerialPort } from 'serialport';
import { parseStatusData, parseExtendedStatus } from './vtr_status_parser.js';

//const { SerialPort } = require('serialport');
//const { parseStatusData, parseExtendedStatus } = require('./vtr_status_parser');

const VTR_PORTS = Array.from({ length: 16 }, (_, i) => `/dev/ttyRP${i}`);
const VTR_BAUD  = 38400;
const CMD_TIMEOUT = 100; // ms

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

export async function getVtrStatus(path) {
  const port = openPort(path);
  // … use sendCommand(port, cmd) same as your test script …
  const main    = await sendCommand(port, Buffer.from([0x61, 0x20, 0x0F]));
  const block0  = await sendCommand(port, Buffer.from([0x61, 0x21, 0x01]));
  const block2  = await sendCommand(port, Buffer.from([0x61, 0x21, 0x02]));
  const hours   = await sendCommand(port, Buffer.from([0x61, 0x2A, 0x0F]));

  const status  = parseStatusData(main.slice(3));
  const ext     = parseExtendedStatus(block0.slice(3), block2.slice(3), hours.slice(3));

  return {
    path,
    model:  status.deviceType,       // or however you name it
    status: humanizeStatus(status, ext)
  };

export function humanizeStatus(main, ext) {
  return [
    main.isPlaying       ? 'PLAY'  : main.isRecording ? 'REC'   : 'STOP',
    main.isInEEMode      ? 'E-E'   : '',
    ext.hoursOperated    && `${ext.hoursOperated}h run`,
    // ... whatever else you want to surface ...
  ].filter(Boolean).join(' • ');
}

export async function autoScanVtrs(portPaths) {
  const results = [];
  for (const p of portPaths) {
    try {
      const status = await getVtrStatus(p);
      results.push(status);
    } catch (err) {
      // unresponsive or not a VTR — skip
    }
  }
  return results;
}

export function openPort(path) {
  return new SerialPort({
    path,
    baudRate: 38400,  // from the Sony spec
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    autoOpen: false
  });
}

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
