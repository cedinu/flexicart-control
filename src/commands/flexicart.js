// src/commands/flexicart.js
const EventEmitter = require('events');

const ports = new Map();
const emitter = new EventEmitter();

/**
 * Register a SerialPort instance under a channel ID for Flexicart commands
 * @param {number} channelId
 * @param {SerialPort} port
 */
function registerPort(channelId, port) {
  ports.set(channelId, port);
  port.on('data', data => {
    emitter.emit(`data:${channelId}`, data);
  });
}

/**
 * Send a command object over the serial port and await a response
 * @param {number} channelId
 * @param {Object} command
 * @returns {Promise<any>}
 */
async function executeCommand(channelId, command) {
  const port = ports.get(channelId);
  if (!port) throw new Error(`Flexicart channel ${channelId} not initialized`);

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(command);
    port.write(payload + '\r');
    const onData = data => {
      clearTimeout(timer);
      emitter.removeListener(`data:${channelId}`, onData);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        resolve(data.toString());
      }
    };
    const timer = setTimeout(() => {
      emitter.removeListener(`data:${channelId}`, onData);
      reject(new Error('Flexicart: response timeout'));
    }, 5000);
    emitter.on(`data:${channelId}`, onData);
  });
}

module.exports = { registerPort, executeCommand };
