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
  const VTR_PORTS = Array.from({length: 16}, (_, i) => `/dev/ttyRP${i}`);
  const usable = [];

  for (const portPath of VTR_PORTS) {
    // skip paths that don’t exist
    if (!fs.existsSync(portPath)) continue;

    try {
      // attempt to open & immediately close at 38400 baud
      await new Promise((res, rej) => {
        const p = new SerialPort({ path: portPath, baudRate: 38400, autoOpen: false });
        p.open(err => err ? rej(err) : p.close(res));
      });
      usable.push({ path: portPath });
    } catch (_err) {
      // can’t open / no VTR there
    }
  }

  const status = {
    timestamp: new Date().toISOString(),
    devices: usable
  };
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  console.log(`Autoscan: found ${usable.length} VTR ports → ${statusPath}`);
  return status;
}

function loadDevices(status) {
  if (Array.isArray(config.devices) && config.devices.length > 0) {
    return config.devices;
  }
  const defaultBaud = (config.serial && config.serial.baudRate) || 38400;
  return status.devices.map((d, idx) => ({
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
