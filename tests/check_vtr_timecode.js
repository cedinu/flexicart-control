const { sendCommand } = require('../src/commands/vtr_interface');
const { playVtr, stopVtr, fastForwardVtr, rewindVtr } = require('../src/commands/vtr_cmds_transport');

/**
 * VTR Timecode Error class for timecode-specific errors
 */
class VtrTimecodeError extends Error {
  constructor(message, code, path) {
    super(message);
    this.name = 'VtrTimecodeError';
    this.code = code;
    this.path = path;
  }
}

/**
 * Sony 9-pin Timecode Commands
 */
const VTR_TIMECODE_COMMANDS = {
  // Standard timecode commands
  CURRENT_TIME_DATA: Buffer.from([0x74, 0x20, 0x54]),      // Current time data ✅
  LTC_TIME_DATA: Buffer.from([0x78, 0x20, 0x58]),          // LTC timecode ✅
  VITC_TIME_DATA: Buffer.from([0x79, 0x20, 0x59]),         // VITC timecode
  TIMER_1: Buffer.from([0x75, 0x20, 0x55]),                // Timer 1 data ✅
  TIMER_2: Buffer.from([0x76, 0x20, 0x56]),                // Timer 2 data
  USER_BITS: Buffer.from([0x77, 0x20, 0x57]),              // User bits data ✅
  TC_GENERATOR: Buffer.from([0x7A, 0x20, 0x5A]),           // TC generator data
  UB_GENERATOR: Buffer.from([0x7B, 0x20, 0x5B]),           // UB generator data
  
  // Tape-specific timecode commands
  TAPE_LTC_READER: Buffer.from([0x71, 0x00, 0x71]),        // Tape LTC position ✅
  CURRENT_POSITION: Buffer.from([0x70, 0x20, 0x50]),       // Current tape position
  TAPE_TIMER: Buffer.from([0x72, 0x00, 0x72]),             // Tape timer position ✅
  CTL_COUNTER: Buffer.from([0x73, 0x20, 0x53]),            // Control track counter ✅
  LTC_READER_DATA: Buffer.from([0x78, 0x00, 0x78]),        // LTC reader direct ✅
  VITC_READER_DATA: Buffer.from([0x79, 0x00, 0x79]),       // VITC reader direct ✅
  CURRENT_TIME_SENSE: Buffer.from([0x74, 0x00, 0x74]),     // Time sense request
  LTC_TIME_SENSE: Buffer.from([0x78, 0x10, 0x68]),         // LTC time sense
  
  // HDW-specific timecode commands
  HDW_CURRENT_TC: Buffer.from([0x61, 0x0A, 0x6B]),         // HDW current timecode ✅
  HDW_LTC_READ: Buffer.from([0x61, 0x0C, 0x6D]),           // HDW LTC read ✅
  HDW_POSITION_DATA: Buffer.from([0x61, 0x10, 0x71]),      // Position data request
  HDW_TIME_DATA: Buffer.from([0x61, 0x12, 0x73]),          // Time data request ✅
  
  // Alternative formats
  HDW_POSITION: Buffer.from([0x71, 0x20, 0x51]),           // HDW Position data
  SEARCH_DATA: Buffer.from([0x72, 0x20, 0x52]),            // Search position
  EXTENDED_STATUS: Buffer.from([0x60, 0x20, 0x40]),        // Extended status
  FULL_STATUS: Buffer.from([0x63, 0x20, 0x43])             // Full status block
};

/**
 * Convert BCD (Binary Coded Decimal) to binary
 * @param {number} bcd - BCD byte
 * @returns {number} Binary value
 */
function bcdToBin(bcd) {
  return ((bcd >> 4) * 10) + (bcd & 0x0F);
}

/**
 * Enhanced timecode decoder for all VTR timecode formats
 * @param {Buffer} response - Raw response buffer
 * @param {string} commandName - Name of command that generated response
 * @returns {string|null} Decoded timecode or null if not valid
 */
function decodeTimecodeResponse(response, commandName) {
  if (!response || response.length < 3) return null;
  
  const bytes = Array.from(response);
  const hex = response.toString('hex');
  
  console.log(`🔍 Analyzing ${commandName} response pattern:`);
  
  // Method 1: Try packed HDW format (your working method)
  if (response.length >= 3) {
    try {
      const packed = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
      const frames = packed & 0x3F;          // 6 bits for frames (0-29)
      const seconds = (packed >> 6) & 0x3F;  // 6 bits for seconds (0-59)
      const minutes = (packed >> 12) & 0x3F; // 6 bits for minutes (0-59)
      const hours = (packed >> 18) & 0x1F;   // 5 bits for hours (0-23)
      
      if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
        const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
        console.log(`   ✅ Packed format: ${timecode}`);
        return timecode;
      }
    } catch (e) {
      // Packed decode failed
    }
  }
  
  // Method 2: Try BCD format
  if (response.length >= 4) {
    try {
      const hours = bcdToBin(bytes[0]);
      const minutes = bcdToBin(bytes[1]);
      const seconds = bcdToBin(bytes[2]);
      const frames = bcdToBin(bytes[3]);
      
      if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
        const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
        console.log(`   ✅ BCD format: ${timecode}`);
        return timecode;
      }
    } catch (e) {
      // BCD decode failed
    }
  }
  
  // Method 3: Try binary format
  if (response.length >= 4) {
    const hours = bytes[0];
    const minutes = bytes[1];
    const seconds = bytes[2];
    const frames = bytes[3];
    
    if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
      const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
      console.log(`   ✅ Binary format: ${timecode}`);
      return timecode;
    }
  }
  
  // Method 4: Try alternative packed format
  if (response.length >= 3) {
    try {
      const packed = (bytes[2] << 16) | (bytes[1] << 8) | bytes[0]; // Reverse byte order
      const frames_alt = (packed >> 0) & 0x3F;
      const seconds_alt = (packed >> 6) & 0x3F;
      const minutes_alt = (packed >> 12) & 0x3F;
      const hours_alt = (packed >> 18) & 0x1F;
      
      if (hours_alt <= 23 && minutes_alt <= 59 && seconds_alt <= 59 && frames_alt <= 29) {
        const timecode = `${hours_alt.toString().padStart(2, '0')}:${minutes_alt.toString().padStart(2, '0')}:${seconds_alt.toString().padStart(2, '0')}:${frames_alt.toString().padStart(2, '0')}`;
        console.log(`   ✅ Alt packed format: ${timecode}`);
        return timecode;
      }
    } catch (e) {
      // Alt packed decode failed
    }
  }
  
  // Check for error patterns
  if (hex.startsWith('91') || hex.startsWith('ff') || hex === '000000') {
    console.log(`   ⚠️  Pattern indicates no timecode available`);
    return null;
  }
  
  console.log(`   ❓ Unknown format - Raw: ${hex}`);
  return null;
}

/**
 * Enhanced timecode decoder for tape-specific formats
 * @param {Buffer} response - Raw response buffer
 * @param {string} commandName - Name of command that generated response
 * @returns {string|null} Decoded timecode or null if not valid
 */
function decodeTapeTimecode(response, commandName) {
  if (!response || response.length < 3) return null;
  
  const bytes = Array.from(response);
  const hex = response.toString('hex');
  
  console.log(`🔍 Analyzing ${commandName} response pattern:`);
  
  // Try different tape timecode formats
  if (response.length >= 4) {
    try {
      const hours = bcdToBin(bytes[0]);
      const minutes = bcdToBin(bytes[1]);
      const seconds = bcdToBin(bytes[2]);
      const frames = bcdToBin(bytes[3]);
      
      if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
        const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
        console.log(`   ✅ BCD Tape format: ${timecode}`);
        return timecode;
      }
    } catch (e) {
      // BCD decode failed
    }
  }
  
  if (response.length >= 4) {
    const hours = bytes[0];
    const minutes = bytes[1];
    const seconds = bytes[2];
    const frames = bytes[3];
    
    if (hours <= 23 && minutes <= 59 && seconds <= 59 && frames <= 29) {
      const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
      console.log(`   ✅ Binary Tape format: ${timecode}`);
      return timecode;
    }
  }
  
  if (response.length >= 3) {
    try {
      const packed = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
      const frames_alt = (packed >> 0) & 0x3F;
      const seconds_alt = (packed >> 6) & 0x3F;
      const minutes_alt = (packed >> 12) & 0x3F;
      const hours_alt = (packed >> 18) & 0x1F;
      
      if (hours_alt <= 23 && minutes_alt <= 59 && seconds_alt <= 59 && frames_alt <= 29) {
        const timecode = `${hours_alt.toString().padStart(2, '0')}:${minutes_alt.toString().padStart(2, '0')}:${seconds_alt.toString().padStart(2, '0')}:${frames_alt.toString().padStart(2, '0')}`;
        console.log(`   ✅ HDW Tape format: ${timecode}`);
        return timecode;
      }
    } catch (e) {
      // Packed decode failed
    }
  }
  
  console.log(`   ❓ No valid tape timecode found - Raw: ${hex}`);
  return null;
}

/**
 * Get actual timecode from VTR using LTC (working method)
 * @param {string} path - VTR port path
 * @returns {Promise<string>} Timecode string
 */
async function getVtrTimecode(path) {
  try {
    console.log('🕐 Getting VTR timecode using LTC...');
    const response = await sendCommand(path, VTR_TIMECODE_COMMANDS.LTC_TIME_DATA, 1000);
    
    if (response && response.length >= 3) {
      const timecode = decodeTimecodeResponse(response, 'LTC');
      return timecode || '00:00:00:00';
    }
    
    return '00:00:00:00';
  } catch (error) {
    console.log(`⚠️  Timecode error: ${error.message}`);
    return '00:00:00:00';
  }
}

/**
 * Test all Sony 9-pin timecode commands
 * @param {string} path - VTR port path
 */
async function testAllTimecodeCommands(path) {
  console.log('🕐 Testing all Sony 9-pin timecode commands...\n');
  
  const timecodeCommands = [
    { name: 'Current Time Data', cmd: VTR_TIMECODE_COMMANDS.CURRENT_TIME_DATA, description: 'Standard TC request' },
    { name: 'LTC Time Data', cmd: VTR_TIMECODE_COMMANDS.LTC_TIME_DATA, description: 'LTC timecode' },
    { name: 'VITC Time Data', cmd: VTR_TIMECODE_COMMANDS.VITC_TIME_DATA, description: 'VITC timecode' },
    { name: 'Timer 1', cmd: VTR_TIMECODE_COMMANDS.TIMER_1, description: 'Timer 1 data' },
    { name: 'Timer 2', cmd: VTR_TIMECODE_COMMANDS.TIMER_2, description: 'Timer 2 data' },
    { name: 'User Bits', cmd: VTR_TIMECODE_COMMANDS.USER_BITS, description: 'User bits data' },
    { name: 'TC Generator', cmd: VTR_TIMECODE_COMMANDS.TC_GENERATOR, description: 'TC generator data' },
    { name: 'UB Generator', cmd: VTR_TIMECODE_COMMANDS.UB_GENERATOR, description: 'UB generator data' },
    { name: 'Extended Status', cmd: VTR_TIMECODE_COMMANDS.EXTENDED_STATUS, description: 'Extended status' },
    { name: 'Full Status', cmd: VTR_TIMECODE_COMMANDS.FULL_STATUS, description: 'Full status block' },
    { name: 'HDW Position', cmd: VTR_TIMECODE_COMMANDS.HDW_POSITION, description: 'Position data' },
    { name: 'Search Data', cmd: VTR_TIMECODE_COMMANDS.SEARCH_DATA, description: 'Search position' }
  ];
  
  for (const tcCmd of timecodeCommands) {
    try {
      console.log(`📤 Testing ${tcCmd.name} (${tcCmd.description})...`);
      console.log(`   Command: ${tcCmd.cmd.toString('hex')}`);
      
      const response = await sendCommand(path, tcCmd.cmd, 3000);
      
      if (response && response.length > 0) {
        console.log(`✅ Response: ${response.toString('hex')} (${response.length} bytes)`);
        console.log(`   Bytes: [${Array.from(response).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
        console.log(`   ASCII: "${response.toString('ascii').replace(/[^\x20-\x7E]/g, '.')}"`);
        
        const decoded = decodeTimecodeResponse(response, tcCmd.name);
        if (decoded && decoded !== 'N/A') {
          console.log(`🕐 Decoded: ${decoded}`);
        }
      } else {
        console.log(`❌ No response`);
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
  }
}

/**
 * Test timecode advancement during transport
 * @param {string} path - VTR port path
 */
async function testTimecodeAdvancement(path) {
  console.log('🎬 Testing timecode advancement during transport...\n');
  
  try {
    console.log('📤 Getting baseline timecode...');
    const ltcBaseline = await sendCommand(path, VTR_TIMECODE_COMMANDS.LTC_TIME_DATA, 1000);
    const timer1Baseline = await sendCommand(path, VTR_TIMECODE_COMMANDS.TIMER_1, 1000);
    
    const ltcBaselineDecoded = decodeTimecodeResponse(ltcBaseline, 'LTC');
    const timer1BaselineDecoded = decodeTimecodeResponse(timer1Baseline, 'Timer1');
    
    console.log(`📊 Baseline LTC: ${ltcBaselineDecoded || 'N/A'}`);
    console.log(`📊 Baseline Timer1: ${timer1BaselineDecoded || 'N/A'}`);
    
    console.log('\n📤 Testing PLAY advancement...');
    await playVtr(path);
    
    const ltcSamples = [];
    const timer1Samples = [];
    
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const ltcSample = await sendCommand(path, VTR_TIMECODE_COMMANDS.LTC_TIME_DATA, 1000);
      const timer1Sample = await sendCommand(path, VTR_TIMECODE_COMMANDS.TIMER_1, 1000);
      
      const ltcDecoded = decodeTimecodeResponse(ltcSample, 'LTC');
      const timer1Decoded = decodeTimecodeResponse(timer1Sample, 'Timer1');
      
      ltcSamples.push(ltcDecoded);
      timer1Samples.push(timer1Decoded);
      
      console.log(`📊 PLAY Sample ${i + 1}: LTC:${ltcDecoded || 'N/A'} | T1:${timer1Decoded || 'N/A'}`);
    }
    
    const ltcAdvanced = ltcSamples.some(sample => sample !== ltcBaselineDecoded);
    const timer1Advanced = timer1Samples.some(sample => sample !== timer1BaselineDecoded);
    
    console.log('\n📊 Analysis:');
    console.log(`   LTC Advanced: ${ltcAdvanced ? '✅ YES' : '❌ NO'}`);
    console.log(`   Timer1 Advanced: ${timer1Advanced ? '✅ YES' : '❌ NO'}`);
    
    if (!ltcAdvanced && !timer1Advanced) {
      console.log('\n⚠️  Timecode is not advancing during PLAY. Possible causes:');
      console.log('   1. Tape is not actually moving (mechanical issue)');
      console.log('   2. No timecode recorded on tape');
      console.log('   3. Timecode reader needs adjustment');
      console.log('   4. VTR servo/transport system issue');
    }
    
    console.log('\n📤 Testing FAST FORWARD...');
    await fastForwardVtr(path);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const ltcFF = await sendCommand(path, VTR_TIMECODE_COMMANDS.LTC_TIME_DATA, 1000);
    const timer1FF = await sendCommand(path, VTR_TIMECODE_COMMANDS.TIMER_1, 1000);
    
    const ltcFFDecoded = decodeTimecodeResponse(ltcFF, 'LTC');
    const timer1FFDecoded = decodeTimecodeResponse(timer1FF, 'Timer1');
    
    console.log(`📊 FF Sample: LTC:${ltcFFDecoded || 'N/A'} | T1:${timer1FFDecoded || 'N/A'}`);
    
    console.log('\n📤 Stopping...');
    await stopVtr(path);
    
  } catch (error) {
    console.log(`❌ Timecode advancement test failed: ${error.message}`);
  }
}

/**
 * Get comprehensive timecode from all sources
 * @param {string} path - VTR port path
 * @returns {Object} Comprehensive timecode data
 */
async function getComprehensiveTimecode(path) {
  console.log('🕐 Getting comprehensive timecode data...\n');
  
  const sources = [
    { name: 'Standard TC', cmd: VTR_TIMECODE_COMMANDS.CURRENT_TIME_DATA },
    { name: 'LTC', cmd: VTR_TIMECODE_COMMANDS.LTC_TIME_DATA },
    { name: 'VITC', cmd: VTR_TIMECODE_COMMANDS.VITC_TIME_DATA },
    { name: 'Timer1', cmd: VTR_TIMECODE_COMMANDS.TIMER_1 },
    { name: 'Timer2', cmd: VTR_TIMECODE_COMMANDS.TIMER_2 },
    { name: 'User Bits', cmd: VTR_TIMECODE_COMMANDS.USER_BITS }
  ];
  
  const results = {};
  
  for (const source of sources) {
    try {
      const response = await sendCommand(path, source.cmd, 1000);
      const decoded = decodeTimecodeResponse(response, source.name);
      results[source.name] = {
        raw: response ? response.toString('hex') : null,
        decoded: decoded,
        valid: decoded !== null && decoded !== 'N/A'
      };
      console.log(`📊 ${source.name}: ${decoded || 'N/A'} (${response ? response.toString('hex') : 'No response'})`);
    } catch (error) {
      results[source.name] = {
        raw: null,
        decoded: null,
        valid: false,
        error: error.message
      };
      console.log(`❌ ${source.name}: ERROR - ${error.message}`);
    }
  }
  
  console.log('\n🕐 Comprehensive timecode complete!\n');
  return results;
}

/**
 * Test tape-specific timecode commands
 * @param {string} path - VTR port path
 */
async function testTapeTimecodeCommands(path) {
  console.log('🎬 Testing tape-specific timecode commands...\n');
  
  const tapeTimecodeCommands = [
    { name: 'Tape LTC Reader', cmd: VTR_TIMECODE_COMMANDS.TAPE_LTC_READER, format: 'Tape LTC position' },
    { name: 'Current Position', cmd: VTR_TIMECODE_COMMANDS.CURRENT_POSITION, format: 'Current tape position' },
    { name: 'Tape Timer', cmd: VTR_TIMECODE_COMMANDS.TAPE_TIMER, format: 'Tape timer position' },
    { name: 'CTL Counter', cmd: VTR_TIMECODE_COMMANDS.CTL_COUNTER, format: 'Control track counter' },
    { name: 'LTC Reader Data', cmd: VTR_TIMECODE_COMMANDS.LTC_READER_DATA, format: 'LTC reader direct' },
    { name: 'VITC Reader Data', cmd: VTR_TIMECODE_COMMANDS.VITC_READER_DATA, format: 'VITC reader direct' },
    { name: 'Current Time Sense', cmd: VTR_TIMECODE_COMMANDS.CURRENT_TIME_SENSE, format: 'Time sense request' },
    { name: 'LTC Time Sense', cmd: VTR_TIMECODE_COMMANDS.LTC_TIME_SENSE, format: 'LTC time sense' },
    { name: 'HDW Current TC', cmd: VTR_TIMECODE_COMMANDS.HDW_CURRENT_TC, format: 'HDW current timecode' },
    { name: 'HDW LTC Read', cmd: VTR_TIMECODE_COMMANDS.HDW_LTC_READ, format: 'HDW LTC read' },
    { name: 'Position Data', cmd: VTR_TIMECODE_COMMANDS.HDW_POSITION_DATA, format: 'Position data request' },
    { name: 'Time Data', cmd: VTR_TIMECODE_COMMANDS.HDW_TIME_DATA, format: 'Time data request' }
  ];
  
  for (const tcCmd of tapeTimecodeCommands) {
    try {
      console.log(`📤 Testing ${tcCmd.name} (${tcCmd.format})...`);
      console.log(`   Command: ${tcCmd.cmd.toString('hex')}`);
      
      const response = await sendCommand(path, tcCmd.cmd, 3000);
      
      if (response && response.length > 0) {
        console.log(`✅ Response: ${response.toString('hex')} (${response.length} bytes)`);
        console.log(`   Bytes: [${Array.from(response).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
        
        const decoded = decodeTapeTimecode(response, tcCmd.name);
        if (decoded && decoded !== 'N/A') {
          console.log(`🕐 Decoded: ${decoded}`);
        }
      } else {
        console.log(`❌ No response`);
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
  }
}

/**
 * Test which timecode source changes during transport to find the real tape timecode
 * @param {string} path - VTR port path
 */
async function testRealTapeTimecode(path) {
  console.log('🎬 Testing which timecode advances with tape movement...\n');
  
  // The working commands we discovered
  const timecodeCommands = [
    { name: 'Tape LTC Reader', cmd: VTR_TIMECODE_COMMANDS.TAPE_LTC_READER },
    { name: 'LTC Reader Data', cmd: VTR_TIMECODE_COMMANDS.LTC_READER_DATA },
    { name: 'VITC Reader Data', cmd: VTR_TIMECODE_COMMANDS.VITC_READER_DATA },
    { name: 'HDW Current TC', cmd: VTR_TIMECODE_COMMANDS.HDW_CURRENT_TC },
    { name: 'HDW LTC Read', cmd: VTR_TIMECODE_COMMANDS.HDW_LTC_READ },
    { name: 'Tape Timer', cmd: VTR_TIMECODE_COMMANDS.TAPE_TIMER },
    { name: 'CTL Counter', cmd: VTR_TIMECODE_COMMANDS.CTL_COUNTER },
    { name: 'Time Data', cmd: VTR_TIMECODE_COMMANDS.HDW_TIME_DATA }
  ];
  
  try {
    // Get baseline readings
    console.log('📤 Getting baseline timecode readings...');
    const baseline = {};
    for (const tcCmd of timecodeCommands) {
      try {
        const response = await sendCommand(path, tcCmd.cmd, 1000);
        const decoded = decodeTapeTimecode(response, tcCmd.name);
        baseline[tcCmd.name] = decoded;
        console.log(`📊 ${tcCmd.name}: ${decoded || 'N/A'}`);
      } catch (e) {
        baseline[tcCmd.name] = 'ERROR';
      }
    }
    
    console.log('\n📤 Starting PLAY and monitoring timecode changes...');
    await playVtr(path);
    
    const samples = [];
    const sampleCount = 3;
    
    for (let i = 0; i < sampleCount; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`\n📊 PLAY Sample ${i + 1}:`);
      const sample = {};
      
      for (const tcCmd of timecodeCommands) {
        try {
          const response = await sendCommand(path, tcCmd.cmd, 1000);
          const decoded = decodeTapeTimecode(response, tcCmd.name);
          sample[tcCmd.name] = decoded;
          
          const changed = decoded !== baseline[tcCmd.name];
          const status = changed ? '🎯 ADVANCING' : '⏸️  Static';
          console.log(`   ${tcCmd.name}: ${decoded || 'N/A'} ${status}`);
        } catch (e) {
          sample[tcCmd.name] = 'ERROR';
        }
      }
      
      samples.push(sample);
    }
    
    console.log('\n📤 Stopping transport...');
    await stopVtr(path);
    
    // Analyze which sources changed
    console.log('\n📊 ANALYSIS - Sources that changed during PLAY:');
    const changingSources = [];
    
    for (const tcCmd of timecodeCommands) {
      const baselineValue = baseline[tcCmd.name];
      const changed = samples.some(sample => sample[tcCmd.name] !== baselineValue);
      
      if (changed) {
        console.log(`✅ ${tcCmd.name}: ADVANCING (${baselineValue})`);
        changingSources.push({
          name: tcCmd.name,
          command: tcCmd.cmd.toString('hex'),
          baseline: baselineValue
        });
      } else {
        console.log(`❌ ${tcCmd.name}: STATIC (${baselineValue})`);
      }
    }
    
    if (changingSources.length > 0) {
      console.log('\n🎯 REAL TAPE TIMECODE SOURCES FOUND:');
      changingSources.forEach(source => {
        console.log(`🎯 ${source.name} (${source.command}) - Use this for real tape timecode!`);
      });
    } else {
      console.log('\n⚠️  No timecode sources advanced during PLAY');
      console.log('   This suggests the tape may not be moving or no timecode is recorded');
    }
    
    return changingSources;
    
  } catch (error) {
    console.log(`❌ Real tape timecode test failed: ${error.message}`);
    return [];
  }
}

/**
 * Test timecode movement with different transport modes
 * @param {string} path - VTR port path
 */
async function testTimecodeMovement(path) {
  console.log('🎬 Testing timecode movement with transport modes...\n');
  
  const testCommands = [
    { name: 'LTC', cmd: VTR_TIMECODE_COMMANDS.LTC_TIME_DATA },
    { name: 'Timer1', cmd: VTR_TIMECODE_COMMANDS.TIMER_1 },
    { name: 'Tape LTC', cmd: VTR_TIMECODE_COMMANDS.TAPE_LTC_READER },
    { name: 'CTL Counter', cmd: VTR_TIMECODE_COMMANDS.CTL_COUNTER }
  ];
  
  try {
    // Get baseline
    console.log('📤 Getting baseline readings...');
    const baseline = {};
    for (const tc of testCommands) {
      try {
        const response = await sendCommand(path, tc.cmd, 1000);
        const decoded = decodeTimecodeResponse(response, tc.name);
        baseline[tc.name] = decoded;
        console.log(`📊 ${tc.name}: ${decoded || 'N/A'}`);
      } catch (e) {
        baseline[tc.name] = 'ERROR';
      }
    }
    
    // Test PLAY
    console.log('\n📤 Testing PLAY mode...');
    await playVtr(path);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    for (const tc of testCommands) {
      try {
        const response = await sendCommand(path, tc.cmd, 1000);
        const decoded = decodeTimecodeResponse(response, tc.name);
        const changed = decoded !== baseline[tc.name];
        console.log(`📊 PLAY ${tc.name}: ${decoded || 'N/A'} ${changed ? '🎯 CHANGED' : '⏸️  Static'}`);
      } catch (e) {
        console.log(`❌ PLAY ${tc.name}: ERROR`);
      }
    }
    
    // Test FAST FORWARD
    console.log('\n📤 Testing FAST FORWARD mode...');
    await fastForwardVtr(path);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    for (const tc of testCommands) {
      try {
        const response = await sendCommand(path, tc.cmd, 1000);
        const decoded = decodeTimecodeResponse(response, tc.name);
        const changed = decoded !== baseline[tc.name];
        console.log(`📊 FF ${tc.name}: ${decoded || 'N/A'} ${changed ? '🎯 CHANGED' : '⏸️  Static'}`);
      } catch (e) {
        console.log(`❌ FF ${tc.name}: ERROR`);
      }
    }
    
    // Test REWIND
    console.log('\n📤 Testing REWIND mode...');
    await rewindVtr(path);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    for (const tc of testCommands) {
      try {
        const response = await sendCommand(path, tc.cmd, 1000);
        const decoded = decodeTimecodeResponse(response, tc.name);
        const changed = decoded !== baseline[tc.name];
        console.log(`📊 REW ${tc.name}: ${decoded || 'N/A'} ${changed ? '🎯 CHANGED' : '⏸️  Static'}`);
      } catch (e) {
        console.log(`❌ REW ${tc.name}: ERROR`);
      }
    }
    
    await stopVtr(path);
    console.log('\n✅ Timecode movement test complete!');
    
  } catch (error) {
    console.log(`❌ Timecode movement test failed: ${error.message}`);
  }
}

/**
 * Get detailed timecode information from VTR
 * @param {string} path - VTR port path
 */
async function getDetailedTimecode(path) {
  console.log('🕐 Getting detailed timecode information...\n');
  
  const sources = [
    { name: 'LTC Time Data', cmd: VTR_TIMECODE_COMMANDS.LTC_TIME_DATA },
    { name: 'VITC Time Data', cmd: VTR_TIMECODE_COMMANDS.VITC_TIME_DATA },
    { name: 'Timer 1', cmd: VTR_TIMECODE_COMMANDS.TIMER_1 },
    { name: 'Timer 2', cmd: VTR_TIMECODE_COMMANDS.TIMER_2 },
    { name: 'User Bits', cmd: VTR_TIMECODE_COMMANDS.USER_BITS },
    { name: 'Tape LTC Reader', cmd: VTR_TIMECODE_COMMANDS.TAPE_LTC_READER },
    { name: 'CTL Counter', cmd: VTR_TIMECODE_COMMANDS.CTL_COUNTER },
    { name: 'HDW Current TC', cmd: VTR_TIMECODE_COMMANDS.HDW_CURRENT_TC }
  ];
  
  for (const source of sources) {
    try {
      console.log(`📤 Getting ${source.name}...`);
      const response = await sendCommand(path, source.cmd, 1000);
      
      if (response && response.length > 0) {
        const hex = response.toString('hex');
        const decoded = decodeTimecodeResponse(response, source.name);
        console.log(`✅ ${source.name}: ${decoded || 'N/A'} (Raw: ${hex})`);
      } else {
        console.log(`❌ ${source.name}: No response`);
      }
    } catch (error) {
      console.log(`❌ ${source.name}: Error - ${error.message}`);
    }
  }
  
  console.log('\n🕐 Detailed timecode complete!\n');
}

/**
 * Check if tape is actually moving during transport
 * @param {string} path - VTR port path
 * @returns {Promise<boolean>} True if tape movement detected
 */
async function checkTapeMovement(path) {
  console.log('🎬 Testing if tape physically moves...');
  
  // Get initial position from multiple sources
  const initialTC = await sendCommand(path, VTR_TIMECODE_COMMANDS.LTC_TIME_DATA, 1000);
  const initialCTL = await sendCommand(path, VTR_TIMECODE_COMMANDS.CTL_COUNTER, 1000);
  
  console.log('📤 Starting PLAY for tape movement test...');
  await playVtr(path);
  
  // Wait longer for mechanical movement
  console.log('⏳ Waiting 10 seconds for tape movement...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Check position again
  const newTC = await sendCommand(path, VTR_TIMECODE_COMMANDS.LTC_TIME_DATA, 1000);
  const newCTL = await sendCommand(path, VTR_TIMECODE_COMMANDS.CTL_COUNTER, 1000);
  
  await stopVtr(path);
  
  const tcChanged = !initialTC.equals(newTC);
  const ctlChanged = !initialCTL.equals(newCTL);
  
  console.log(`📊 TC Changed: ${tcChanged ? '✅ YES' : '❌ NO'}`);
  console.log(`📊 CTL Changed: ${ctlChanged ? '✅ YES' : '❌ NO'}`);
  
  return tcChanged || ctlChanged;
}

/**
 * Monitor timecode in real-time
 * @param {string} path - VTR port path
 * @param {number} intervalMs - Monitoring interval in milliseconds
 */
async function monitorTimecode(path, intervalMs = 1000) {
  console.log(`🕐 Monitoring timecode at ${path} (${intervalMs}ms interval)...`);
  console.log('Press Ctrl+C to stop monitoring');
  
  const monitor = async () => {
    try {
      const ltcResponse = await sendCommand(path, VTR_TIMECODE_COMMANDS.LTC_TIME_DATA, 500);
      const timecode = decodeTimecodeResponse(ltcResponse, 'LTC');
      const timestamp = new Date().toLocaleTimeString();
      
      console.log(`[${timestamp}] TC: ${timecode || 'N/A'}`);
    } catch (error) {
      console.log(`[${new Date().toLocaleTimeString()}] ❌ Error: ${error.message}`);
    }
  };
  
  // Initial check
  await monitor();
  
  // Set up interval
  const interval = setInterval(monitor, intervalMs);
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n👋 Timecode monitoring stopped');
    process.exit(0);
  });
}

module.exports = {
  // Timecode functions
  getVtrTimecode,
  testAllTimecodeCommands,
  testTimecodeAdvancement,
  getComprehensiveTimecode,
  testTapeTimecodeCommands,
  testRealTapeTimecode,
  testTimecodeMovement,
  getDetailedTimecode,
  checkTapeMovement,
  monitorTimecode,
  
  // Utility functions
  decodeTimecodeResponse,
  decodeTapeTimecode,
  bcdToBin,
  
  // Constants
  VTR_TIMECODE_COMMANDS,
  
  // Error class
  VtrTimecodeError
};