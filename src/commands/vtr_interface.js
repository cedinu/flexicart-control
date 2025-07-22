// src/commands/vtr_interface.js
const fs = require('fs');
const { SerialPort } = require('serialport');
const { parseStatusData, parseExtendedStatus } = require('./vtr_status_parser');
const STATUS_PATH = require('path').join(__dirname, '../config/status.json');

const VTR_PORTS = Array.from({ length: 16 }, (_, i) => `/dev/ttyRP${i}`);
const VTR_BAUD  = 38400;
const CMD_TIMEOUT = 100;

function openPort(path) {
  return new SerialPort({ path, baudRate: VTR_BAUD, dataBits: 8, stopBits: 1, parity: 'none', autoOpen: false });
}

function sendCommand(port, buffer) {
  return new Promise((res, rej) => {
    const chunks = [];
    port.open(err => err ? rej(err) : port.write(buffer, err2 => {
      if (err2) return rej(err2);
      port.drain(() => {
        port.on('data', d => chunks.push(d));
        setTimeout(() => port.close(() => res(Buffer.concat(chunks))), CMD_TIMEOUT);
      });
    }));
  });
}

async function getVtrStatus(idx) {
  const path = VTR_PORTS[idx];
  if (!fs.existsSync(path)) throw new Error('no such port');
  const cmds = [
    Buffer.from([0x61,0x20,0x0F]),  // main status
    Buffer.from([0x61,0x21,0x00]),  // block0
    Buffer.from([0x61,0x23,0x00]),  // block2
    Buffer.from([0x61,0x2A,0x0F])   // hours
  ];
  const port = openPort(path);
  const results = [];
  for (const c of cmds) results.push(await sendCommand(port, c));
  const [main, blk0, blk2, hrs] = results.map(b => b.slice(3));
  const base = parseStatusData(main);
  const ext  = parseExtendedStatus(blk0, blk2, hrs);
  return {
    type:    'vtr',
    channel: idx,
    port:    path,
    model:   ext.model,
    status:  base.transport,  // e.g. “stop”/“play” etc.
  };
}

async function autoScanVtrs() {
  const found = [];
  for (let i=0; i<VTR_PORTS.length; i++) {
    try { found.push(await getVtrStatus(i)); }
    catch(_) { /* not a VTR or no response */ }
  }
  return found;
}

module.exports = { autoScanVtrs };
