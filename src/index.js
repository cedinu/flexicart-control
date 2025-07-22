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
app.use(express.static(path.join(__dirname, '../public')));

let server;
if (process.env.NODE_ENV === 'production') {
  const key = fs.readFileSync(config.tls.key);
  const cert = fs.readFileSync(config.tls.cert);
  server = https.createServer({ key, cert }, app);
} else {
  server = http.createServer(app);
}

const wss = new WebSocket.Server({ server });

server.listen(config.httpPort, () => {
  console.log(`Listening on port ${config.httpPort}`);
});

// Initialize serial ports
config.devices.forEach(device => {
  const port = new SerialPort({
    path: device.path,
    baudRate: device.baudRate,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
  });

  // Catch serial port errors globally
  port.on('error', err => {
    console.error(`Serial port error on channel ${device.channelId}:`, err);
  });

  // Register port with the appropriate module
  if (device.type === 'vtr') {
    vtrModule.registerPort(device.channelId, port);
  } else if (device.type === 'flexicart') {
    flexicartModule.registerPort(device.channelId, port);
  } else {
    console.warn(`Unknown device type: ${device.type} for channel ${device.channelId}`);
  }
});

// WebSocket message handling with channel support
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
      let result;
      if (target === 'vtr') {
        result = await vtrModule.executeCommand(channel, command);
      } else if (target === 'flexicart') {
        result = await flexicartModule.executeCommand(channel, command);
      } else {
        throw new Error(`Unknown target: ${target}`);
      }
      ws.send(JSON.stringify({ ok: true, result }));
    } catch (err) {
      console.error('Command execution error:', err);
      ws.send(JSON.stringify({ error: err.message }));
    }
  });
});
