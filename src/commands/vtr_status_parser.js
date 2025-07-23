// src/commands/vtr_status_parser.js
// Stub parser for VTR status blocks
// TODO: implement according to Sony 9-pin protocol

/**
 * Parse VTR status data from buffer
 * @param {Buffer} buffer - Raw status data from VTR
 * @returns {Object} Parsed status object
 */
function parseStatusData(buffer) {
  if (!buffer || buffer.length === 0) {
    return {
      timecode: '00:00:00:00',
      mode: 'stop',
      speed: '1x',
      tape: false,
      error: 'No data received'
    };
  }

  try {
    // Convert buffer to string and parse
    const data = buffer.toString('ascii').trim();
    
    // Example parsing logic - adjust based on actual VTR protocol
    const lines = data.split('\n');
    const status = {
      timecode: '00:00:00:00',
      mode: 'stop',
      speed: '1x',
      tape: false,
      error: null
    };

    for (const line of lines) {
      if (line.includes('TC:')) {
        status.timecode = line.substring(3).trim();
      } else if (line.includes('MODE:')) {
        status.mode = line.substring(5).trim().toLowerCase();
      } else if (line.includes('SPEED:')) {
        status.speed = line.substring(6).trim();
      } else if (line.includes('TAPE:')) {
        status.tape = line.substring(5).trim().toLowerCase() === 'in';
      }
    }

    return status;
  } catch (error) {
    return {
      timecode: '00:00:00:00',
      mode: 'error',
      speed: '0x',
      tape: false,
      error: `Parse error: ${error.message}`
    };
  }
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
