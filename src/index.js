// src/index.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const { SerialPort } = require('serialport');

const vtrInterface = require('./commands/vtr_interface');
const flexInterface = require('./commands/flexicart_interface');

const config = require('../config/default.json');
const statusPath = path.join(__dirname, '../config/status.json');

/**
 * Scan for VTRs and Flexicarts, produce human-readable device entries
 */
async function autoscanDevices() {
  const rawVtrs  = await vtrInterface.autoScanVtrs();
  const rawFlex  = await flexInterface.autoScanFlexicarts().catch(() => []);

  const vtrs = rawVtrs.map(v => ({
    path:  v.port,
    type:  'vtr',
    model: v.model || v.modelCode,
    status: Array.isArray(v.transport) ? v.transport.join(' | ') : v.transport,
    hours: v.operationHours
  }));

  const flexs = rawFlex.map(f => ({
    path:    f.port,
    type:    'flexicart',
    model:   f.model,
    status:  f.status,
    uptime:  f.uptime
  }));

  const devices = [...vtrs, ...flexs];
  const status = { timestamp: new Date().toISOString(), devices };
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  console.log(`Autoscan: wrote ${devices.length} devices to ${statusPath}`);
  return status;
}

/**
 * Initialize serial ports and start HTTP API
 */
async function init() {
  // Always rescan at startup
  const status = await autoscanDevices();
  const httpPort = config.port || 3000;

  // Open and register serial ports
  if (!status.devices.length) console.log('No devices found during autoscan');
  else {
    console.log(`Initializing ${status.devices.length} devices…`);
    status.devices.forEach((d, idx) => {
      d.channel = idx;
      const port = new SerialPort({
        path:     d.path,
        baudRate: config.serial?.baudRate || 38400,
        dataBits: 8,
        stopBits: 1,
        parity:   'none',
        autoOpen: true
      }, err => {
        if (err) console.error(`Serial error on ${d.path}:`, err.message);
      });

      if (d.type === 'vtr') vtrInterface.registerPort(idx, port);
      else if (d.type === 'flexicart') flexInterface.registerPort(idx, port);
    });
  }

  // HTTP API
  const app = express();
  app.use(express.json());
  app.get('/api/devices', (req,res) => res.json(status.devices));
  app.get('/api/status',  (req,res) => res.json(status));
  app.get('/api/config',  (req,res) => res.json(config));

  app.listen(httpPort, () => console.log(`Listening on port ${httpPort}`));
}

init().catch(err => {
  console.error('Init failed:', err);
  process.exit(1);
});
