const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const WebSocket = require('ws');
// SerialPort for RS‑422 communication
const { SerialPort } = require('serialport');
const vtrModule = require('./commands/vtr');
const flexicartModule = require('./commands/flexicart');

const config = require('../config/default.json');
const app = express();
const PORT = process.env.PORT || config.httpPort;

// Health endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Initialize serial channels for RS‑422
for (const device of config.rs422Devices) {
  const port = new SerialPort({
    path: device.path,
    baudRate: device.baudRate,
    dataBits: 8,
    parity: 'none',
    stopBits: 1
  });
  // Attach to modules by name
  if (device.type === 'vtr') vtrModule.registerPort(device.channelId, port);
  if (device.type === 'flexicart') flexicartModule.registerPort(device.channelId, port);
}

// Create HTTP or HTTPS server
let server;
if (process.env.NODE_ENV === 'production') {
  const options = {
    key: fs.readFileSync(config.tls.key),
    cert: fs.readFileSync(config.tls.cert)
  };
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}

// WebSocket server
const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
  ws.on('message', async msg => {
    const { target, command } = JSON.parse(msg);
    let result;
    if (target === 'vtr') result = await vtrModule.executeCommand(command);
    if (target === 'flexicart') result = await flexicartModule.executeCommand(command);
    ws.send(JSON.stringify({ target, result }));
  });
});

server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
