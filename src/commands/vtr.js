// src/commands/vtr.js
const { Buffer } = require('buffer');
const { COMMANDS } = require('./vtr_commands');

function calculateChecksum(bytes) {
  return bytes.reduce((sum, b) => (sum + b) & 0xFF, 0);
}

function buildCommand(cmd1, cmd2, data = []) {
  const header = [cmd1 & 0xFF, data.length & 0xFF, cmd2 & 0xFF, ...data.map(d => d & 0xFF)];
  const checksum = calculateChecksum(header);
  return Buffer.from([...header, checksum]);
}

function buildSpeedCommand(type, speedByte, extra = 0x00) {
  const def = COMMANDS[type];
  if (!def) throw new Error(`Unknown speed command: ${type}`);
  const cmd1 = def.cmd1Base;
  return buildCommand(cmd1, def.cmd2, [speedByte & 0xFF, extra & 0xFF]);
}

module.exports = {
  buildCommand,
  calculateChecksum,
  buildSpeedCommand,
  COMMANDS,
};
