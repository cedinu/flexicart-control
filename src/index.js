// src/index.js
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { SerialPort } = require('serialport');

const config = require('../config/default.json');
const vtrModule = require('./commands/vtr');
const flexicartModule = require('./commands/flexicart');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Paths for status and config
const statusPath = path.join(__dirname, '../config/status.json');

// Autoscan available serial ports and write to status.json
async function autoscanDevices() {
  try {
    const portsList = (await SerialPort.list())
      .filter(p => /^\/dev\/ttyRP(?:[0-9]|1[0-5])$/.test(p.path));
    const status = {
      timestamp: new Date().toISOString(),
      devices: portsList.map(p => ({ path: p.path, manufacturer: p.manufacturer, serialNumber: p.serialNumber, pnpId: p.pnpId, vendorId: p.vendorId, productId: p.productId }))
    };
    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
    console.log(`Autoscan: wrote detected serial ports to ${statusPath}`);
    return status;
  } catch (err) {
    console.error('Autoscan failed:', err);
    return { timestamp: new Date().toISOString(), devices: [] };
  }
}

function loadDevices(status) {
  // if user config exists, use that…
  if (Array.isArray(config.devices) && config.devices.length > 0) {
    return config.devices;
  }
  // otherwise use all RP ports found in status.json
  const defaultBaud = (config.serial && config.serial.baudRate) || 38400;
  return status.devices
    .filter(d => /^\/dev\/ttyRP(?:[0-9]|1[0-5])$/.test(d.path))
    .map((d, idx) => ({
      path:      d.path,
      baudRate:  defaultBaud,
      channelId: idx,
      type:      'vtr'
    }));
}


(async function init() {
  const status = await autoscanDevices();

  const useHttps = process.env.NODE_ENV === 'production';
  const server = useHttps
    ? https.createServer({ key: fs.readFileSync(config.tls.key), cert: fs.readFileSync(config.tls.cert) }, app)
    : http.createServer(app);

  // API to fetch current scanned devices
  app.get('/api/devices', (req, res) => {
    const fresh = fs.existsSync(statusPath)
      ? JSON.parse(fs.readFileSync(statusPath))
      : { timestamp: new Date().toISOString(), devices: [] };
    res.json(fresh);
  });

  // WebSocket server setup
  const wss = new WebSocket.Server({ server });
  wss.on('connection', ws => {
    ws.on('message', async message => {
      let parsed;
      try {
        parsed = JSON.parse(message);
      } catch (err) {
        console.error('Failed to parse message:', message, err);
        return ws.send(JSON.stringify({ error: 'Invalid JSON' }));
      }
      const { target, channel, command } = parsed;
      if (!target || typeof channel !== 'number' || !command) {
        return ws.send(JSON.stringify({ error: 'Missing target, channel, or command' }));
      }
      try {
        const runner = target === 'vtr' ? vtrModule : target === 'flexicart' ? flexicartModule : null;
        if (!runner || typeof runner.executeCommand !== 'function') throw new Error(`Unknown target: ${target}`);
        const result = await runner.executeCommand(channel, command);
        ws.send(JSON.stringify({ ok: true, result }));
      } catch (err) {
        console.error('Command execution error:', err);
        ws.send(JSON.stringify({ error: err.message }));
      }
    });
  });

  // Initialize serial ports
  const devices = loadDevices(status);
  if (!devices.length) console.warn('No devices to initialize');

  devices.forEach(device => {
    if (!device.path || !device.baudRate || typeof device.channelId !== 'number') {
      console.warn('Skipping invalid device entry:', device);
      return;
    }
    const port = new SerialPort({ path: device.path, baudRate: device.baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
    port.on('error', err => console.error(`Serial port error on channel ${device.channelId}:`, err));

    // Register port if supported by module
    if (device.type === 'vtr') {
      if (typeof vtrModule.registerPort === 'function') {
        vtrModule.registerPort(device.channelId, port);
      } else {
        console.warn('vtrModule.registerPort() not available; skipping port registration for channel', device.channelId);
      }
    } else if (device.type === 'flexicart') {
      if (typeof flexicartModule.registerPort === 'function') {
        flexicartModule.registerPort(device.channelId, port);
      } else {
        console.warn('flexicartModule.registerPort() not available; skipping port registration for channel', device.channelId);
      }
    } else {
      console.warn(`Unknown device type: ${device.type} for channel ${device.channelId}`);
    }
  });

  server.listen(config.httpPort, () => console.log(`Listening on port ${config.httpPort}`));
})();
