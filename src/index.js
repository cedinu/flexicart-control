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
    const portsList = await SerialPort.list();
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

// Load devices from status.json
function loadDevices(status) {
  // If default config defines devices, use that
  if (Array.isArray(config.devices) && config.devices.length) {
    return config.devices;
  }
  // Fallback: map scanned ports to default device entries
  const defaultBaud = (config.serial && config.serial.baudRate) || 9600;
  return status.devices.map((d, idx) => ({
    path: d.path,
    baudRate: defaultBaud,
    channelId: idx,
    type: 'vtr'
  }));
}

(async function init() {
  // 1. Autoscan and write status
  const status = await autoscanDevices();

  // 2. HTTP/HTTPS setup
  const useHttps = process.env.NODE_ENV === 'production';
  const server = useHttps
    ? https.createServer({ key: fs.readFileSync(config.tls.key), cert: fs.readFileSync(config.tls.cert) }, app)
    : http.createServer(app);

  // 3. Expose API for status/devices
  app.get('/api/devices', (req, res) => {
    const fresh = fs.existsSync(statusPath)
      ? JSON.parse(fs.readFileSync(statusPath))
      : { timestamp: new Date().toISOString(), devices: [] };
    res.json(fresh);
  });

  // 4. WebSocket server
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
        if (!runner) throw new Error(`Unknown target: ${target}`);
        const result = await runner.executeCommand(channel, command);
        ws.send(JSON.stringify({ ok: true, result }));
      } catch (err) {
        console.error('Command execution error:', err);
        ws.send(JSON.stringify({ error: err.message }));
      }
    });
  });

  // 5. Initialize serial ports from dynamic device list
  const devices = loadDevices(status);
  if (!devices.length) console.warn('No devices to initialize');

  devices.forEach(device => {
    if (!device.path || !device.baudRate || typeof device.channelId !== 'number') {
      console.warn('Skipping invalid device entry:', device);
      return;
    }
    const port = new SerialPort({ path: device.path, baudRate: device.baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
    port.on('error', err => console.error(`Serial port error on channel ${device.channelId}:`, err));
    if (device.type === 'vtr') vtrModule.registerPort(device.channelId, port);
    else if (device.type === 'flexicart') flexicartModule.registerPort(device.channelId, port);
    else console.warn(`Unknown device type: ${device.type}`);
  });

  // 6. Start server
  server.listen(config.httpPort, () => console.log(`Listening on port ${config.httpPort}`));
})();
