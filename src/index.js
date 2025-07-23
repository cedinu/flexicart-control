// src/index.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const WebSocket = require('ws');

// Import CommonJS modules for VTR and Flexicart interfaces
const vtrInterface = require('./commands/vtr_interface');
const flexInterface = require('./commands/flexicart_interface');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'status.json');
const HTTP_PORT = process.env.PORT || 8080;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;

/**
 * Probe all serial devices (VTRs and Flexicarts) and write detected devices to status.json
 */
async function autoscanDevices() {
  console.log('Autoscan: probing', vtrInterface.VTR_PORTS);
  // Scan Sony VTRs
  const vtrs = await vtrInterface.autoScanVtrs(vtrInterface.VTR_PORTS);
  // Scan Flexicart controllers
  const flexicarts = await flexInterface.autoScanFlexicarts();

  const devices = [...vtrs, ...flexicarts];
  const status = { timestamp: new Date().toISOString(), devices };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(status, null, 2));
  console.log(`Autoscan: wrote ${devices.length} devices to ${CONFIG_PATH}`);
  if (!devices.length) console.log('No devices found during autoscan');
}

/**
 * Initialize the application: autoscan and start HTTP/HTTPS servers
 */
async function init() {
  try {
    await autoscanDevices();
  } catch (err) {
    console.error('Init failed:', err);
  }

  const app = express();
  // Static file serving, API routes, etc.

  // HTTP + WS
  const httpServer = http.createServer(app);
  const wsServer = new WebSocket.Server({ server: httpServer });
  wsServer.on('connection', socket => {
    console.log('WS connection');
    socket.on('message', msg => console.log('WS message:', msg));
  });
  httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP server + WS listening on port ${HTTP_PORT}`);
  });

  // HTTPS + WSS (if cert/key exist)
  const keyPath = path.join(__dirname, 'ssl', 'key.pem');
  const certPath = path.join(__dirname, 'ssl', 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const sslOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    const httpsServer = https.createServer(sslOptions, app);
    const wssServer = new WebSocket.Server({ server: httpsServer });
    wssServer.on('connection', socket => {
      console.log('WSS connection');
    });
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`HTTPS server + WSS listening on port ${HTTPS_PORT}`);
    });
  } else {
    console.log('SSL key/cert not configured: skipping HTTPS/WSS startup');
  }
}

init();
