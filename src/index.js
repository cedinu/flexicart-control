// src/index.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const { SerialPort } = require('serialport');

const vtrModule = require('./commands/vtr');
const flexicartModule = require('./commands/flexicart');
const { autoScanVtrs } = require('./commands/vtr_interface');
const { autoScanFlexicarts } = require('./commands/flexicart_interface');

const config = require('../config/default.json');
const statusPath = path.join(__dirname, '../config/status.json');

/**
 * Run the VTR & Flexicart autoscan routines and write out status.json
 */
async function autoscanDevices() {
  const vtrs = await autoScanVtrs();
  let flexs = [];
  try {
    flexs = await autoScanFlexicarts();
  } catch (_) {
    // no flexicarts found or scanner not implemented
  }

  const devices = [...vtrs, ...flexs];
  const status = {
    timestamp: new Date().toISOString(),
    devices
  };
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  console.log(`Autoscan: wrote detected devices to ${statusPath}`);
  return status;
}

/**
 * Load the list of devices either from user config or from last scan
 */
function loadDevices(status) {
  // 1) if the user has explicitly configured devices, use that
  if (Array.isArray(config.devices) && config.devices.length > 0) {
    return config.devices;
  }
  // 2) otherwise take whatever we scanned
  const defaultBaud = (config.serial && config.serial.baudRate) || 38400;
  return status.devices.map((d, idx) => ({
    path:      d.path,
    baudRate:  defaultBaud,
    channelId: idx,
    type:      d.type
  }));
}

/**
 * Initialize serial ports, register them with the command modules, and start HTTP API
 */
async function init() {
  // load existing scan or re-scan if missing
  let status;
  if (fs.existsSync(statusPath)) {
    try {
      status = JSON.parse(fs.readFileSync(statusPath));
    } catch {
      status = await autoscanDevices();
    }
  } else {
    status = await autoscanDevices();
  }

  const devices = loadDevices(status);
  if (devices.length === 0) {
    console.log('No devices to initialize');
  } else {
    console.log(`Initializing ${devices.length} serial devices…`);
    devices.forEach(device => {
      const port = new SerialPort({
        path:      device.path,
        baudRate:  device.baudRate,
        dataBits:  8,
        stopBits:  1,
        parity:    'none',
        autoOpen:  true
      }, err => {
        if (err) {
          console.error(`Serial port error on channel ${device.channelId}:`, err);
        }
      });

      if (device.type === 'vtr') {
        vtrModule.registerPort(device.channelId, port);
      } else if (device.type === 'flexicart') {
        flexicartModule.registerPort(device.channelId, port);
      }
    });
  }

  // HTTP API
  const app = express();
  app.use(express.json());

  app.get('/api/devices', (req, res) => res.json(devices));
  app.get('/api/status',  (req, res) => res.json(status));
  app.get('/api/config',  (req, res) => res.json(config));

  const httpPort = config.port || 3000;
  app.listen(httpPort, () => {
    console.log(`Listening on port ${httpPort}`);
  });
}

init().catch(err => {
  console.error('Initialization failed:', err);
  process.exit(1);
});
