// src/index.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const { SerialPort } = require('serialport');

const vtrInterface = require('./commands/vtr_interface');
const flexInterface = require('./commands/flexicart_interface');

const config = require('../config/default.json');
const statusPath = path.join(__dirname, '../config/status.json');

/**
 * Scan for VTRs and Flexicarts, produce human-readable device entries
 */
async function autoscanDevices() {
  const rawVtrs = await vtrInterface.autoScanVtrs().catch(() => []);

  let rawFlex = [];
  if (typeof flexInterface.autoScanFlexicarts === 'function') {
    rawFlex = await flexInterface.autoScanFlexicarts().catch(() => []);
  } else if (typeof flexInterface.autoScan === 'function') {
    rawFlex = await flexInterface.autoScan().catch(() => []);
  }

  const vtrs = rawVtrs.map((v, idx) => ({
    path:   v.port,
    type:   'vtr',
    model:  v.model || v.modelCode || 'unknown',
    status: Array.isArray(v.transport) ? v.transport.join(' | ') : v.transport,
    hours:  v.operationHours || 0,
    channel: idx
  }));

  const flexs = rawFlex.map((f, idx) => ({
    path:   f.port,
    type:   'flexicart',
    model:  f.model || 'unknown',
    status: f.status || 'unknown',
    uptime: f.uptime || 0,
    channel: vtrs.length + idx
  }));

  const devices = [...vtrs, ...flexs];
  const status = { timestamp: new Date().toISOString(), devices };

  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  console.log(`Autoscan: wrote ${devices.length} devices to ${statusPath}`);
  return status;
}

/**
 * Initialize serial ports and start HTTP/HTTPS + WS/WSS API
 */
async function init() {
  try {
    const status = await autoscanDevices();

    if (!status.devices.length) console.log('No devices found during autoscan');
    else {
      console.log(`Initializing ${status.devices.length} devices…`);
      status.devices.forEach(d => {
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

        if (d.type === 'vtr') {
          vtrInterface.registerPort(d.channel, port);
        } else if (d.type === 'flexicart' && typeof flexInterface.registerPort === 'function') {
          flexInterface.registerPort(d.channel, port);
        }
      });
    }

    const app = express();
    app.use(express.json());
    app.get('/api/devices', (req, res) => res.json(status.devices));
    app.get('/api/status',  (req, res) => res.json(status));
    app.get('/api/config',  (req, res) => res.json(config));

    // HTTP + WS on 8080
    const httpServer = http.createServer(app);
    const wsServer = new WebSocket.Server({ server: httpServer });
    wsServer.on('connection', socket => {
      socket.send(JSON.stringify({ type: 'status', data: status }));
    });
    httpServer.listen(8080, () => console.log('HTTP server + WS listening on port 8080'));

    // HTTPS + WSS on 8443
    if (config.ssl?.keyPath && config.ssl?.certPath) {
      const sslOptions = {
        key: fs.readFileSync(config.ssl.keyPath),
        cert: fs.readFileSync(config.ssl.certPath)
      };
      const httpsServer = https.createServer(sslOptions, app);
      const wss = new WebSocket.Server({ server: httpsServer });
      wss.on('connection', socket => {
        socket.send(JSON.stringify({ type: 'status', data: status }));
      });
      httpsServer.listen(8443, () => console.log('HTTPS server + WSS listening on port 8443'));
    } else {
      console.warn('SSL key/cert not configured: skipping HTTPS/WSS startup');
    }

  } catch (err) {
    console.error('Init failed:', err);
    process.exit(1);
  }
}

init();
