// src/commands/vtr_status_parser.js
// Stub parser for VTR status blocks
// TODO: implement according to Sony 9-pin protocol

/**
 * Parse the main STATUS DATA block (response to 61 20 0F)
 * @param {Buffer} buf  -- raw bytes of status data
 * @returns {Object}    -- minimal fields
 */
function parseStatusData(buf) {
  // For now, just return a placeholder transport status
  return {
    transport: 'unknown',
  };
}

/**
 * Parse extended status blocks and hours meter
 * @param {Buffer} blk0   -- DATA from block 0 (signal control)
 * @param {Buffer} blk2   -- DATA from block 2 (transport)
 * @param {Buffer} hours  -- DATA from block 0x2A (hours meter)
 * @returns {Object}      -- at least model field
 */
function parseExtendedStatus(blk0, blk2, hours) {
  // TODO: decode model from hours block (bytes 1-2)
  const modelCode = hours && hours.length >= 2 ? hours.readUInt16BE(0) : 0;
  return {
    model: `model_${modelCode}`,
  };
}

module.exports = { parseStatusData, parseExtendedStatus };
