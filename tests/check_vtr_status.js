const { autoScanVtrs, getVtrStatus, VTR_PORTS, humanizeStatus, sendCommand } = require('../src/commands/vtr_interface');

// Sony VTR Control Commands - HDW Series Compatible
const VTR_COMMANDS = {
  // Transport Control Commands
  PLAY: Buffer.from([0x88, 0x01, 0x2C, 0x01, 0xFF]),        // Play (corrected)
  STOP: Buffer.from([0x88, 0x01, 0x20, 0x0F, 0xFF]),        // Stop (corrected)
  PAUSE: Buffer.from([0x88, 0x01, 0x25, 0x11, 0xFF]),       // Pause/Still (corrected)
  RECORD: Buffer.from([0x88, 0x01, 0x2F, 0x01, 0xFF]),      // Record (corrected)
  FAST_FORWARD: Buffer.from([0x88, 0x01, 0x21, 0x0F, 0xFF]), // Fast Forward (corrected)
  REWIND: Buffer.from([0x88, 0x01, 0x22, 0x0F, 0xFF]),      // Rewind (corrected)
  
  // Status and Information Commands
  STATUS: Buffer.from([0x88, 0x01, 0x61, 0x20, 0xFF]),      // Device Status (corrected)
  TIMECODE: Buffer.from([0x88, 0x01, 0x74, 0x20, 0xFF]),    // Current Time Sense (corrected)
  
  // Additional HDW-specific commands
  EJECT: Buffer.from([0x88, 0x01, 0x2A, 0x05, 0xFF]),       // Eject
  JOG_FORWARD: Buffer.from([0x88, 0x01, 0x21, 0x01, 0xFF]), // Jog Forward
  JOG_REVERSE: Buffer.from([0x88, 0x01, 0x22, 0x01, 0xFF]), // Jog Reverse
  SHUTTLE_PLUS_1: Buffer.from([0x88, 0x01, 0x21, 0x02, 0xFF]), // Shuttle +1x
  SHUTTLE_MINUS_1: Buffer.from([0x88, 0x01, 0x22, 0x02, 0xFF]), // Shuttle -1x
  
  // Search Commands
  CUE_UP_WITH_DATA: Buffer.from([0x88, 0x01, 0x24, 0x31, 0xFF]), // Cue up with data
  SEARCH_PRESET: Buffer.from([0x88, 0x01, 0x30, 0x00, 0xFF]),    // Search preset
  
  // Status Request Commands  
  LOCAL_DISABLE: Buffer.from([0x88, 0x01, 0x0C, 0x00, 0xFF]),    // Local disable
  LOCAL_ENABLE: Buffer.from([0x88, 0x01, 0x0C, 0x01, 0xFF]),     // Local enable
  DEVICE_TYPE: Buffer.from([0x88, 0x01, 0x00, 0x11, 0xFF]),      // Device type request
  
  // HDW Extended Status
  EXTENDED_STATUS: Buffer.from([0x88, 0x01, 0x65, 0x20, 0xFF]),  // Extended device status
  SIGNAL_CONTROL: Buffer.from([0x88, 0x01, 0x6A, 0x20, 0xFF]),   // Signal control status
  TAPE_TIMER: Buffer.from([0x88, 0x01, 0x75, 0x20, 0xFF])        // Tape timer sense
};

/**
 * Send a control command to VTR
 * @param {string} path - VTR port path
 * @param {Buffer} command - Command buffer
 * @param {string} commandName - Human readable command name
 */
async function sendVtrCommand(path, command, commandName) {
  console.log(`📤 Sending ${commandName} command to ${path}...`);
  
  try {
    const response = await sendCommand(path, command, 3000);
    
    if (response && response.length > 0) {
      console.log(`✅ ${commandName} command sent successfully`);
      console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
      
      // Wait a bit then check status
      await new Promise(resolve => setTimeout(resolve, 500));
      const status = await getVtrStatus(path);
      console.log(`📊 New status: ${status.mode.toUpperCase()} - TC: ${status.timecode}`);
      
      return true;
    } else {
      console.log(`⚠️  ${commandName} command sent but no response received`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${commandName} command failed: ${error.message}`);
    return false;
  }
}

/**
 * Play command
 * @param {string} path - VTR port path
 */
async function playVtr(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.PLAY, 'PLAY');
}

/**
 * Pause command
 * @param {string} path - VTR port path
 */
async function pauseVtr(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.PAUSE, 'PAUSE');
}

/**
 * Stop command
 * @param {string} path - VTR port path
 */
async function stopVtr(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.STOP, 'STOP');
}

/**
 * Record command
 * @param {string} path - VTR port path
 */
async function recordVtr(path) {
  console.log('⚠️  RECORD command - use with caution!');
  return await sendVtrCommand(path, VTR_COMMANDS.RECORD, 'RECORD');
}

/**
 * Fast Forward command
 * @param {string} path - VTR port path
 */
async function fastForwardVtr(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.FAST_FORWARD, 'FAST FORWARD');
}

/**
 * Rewind command
 * @param {string} path - VTR port path
 */
async function rewindVtr(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.REWIND, 'REWIND');
}

/**
 * HDW-specific command functions
 */
async function ejectTape(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.EJECT, 'EJECT');
}

async function jogForward(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_FORWARD, 'JOG FORWARD');
}

async function jogReverse(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.JOG_REVERSE, 'JOG REVERSE');
}

async function shuttlePlus1(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.SHUTTLE_PLUS_1, 'SHUTTLE +1x');
}

async function shuttleMinus1(path) {
  return await sendVtrCommand(path, VTR_COMMANDS.SHUTTLE_MINUS_1, 'SHUTTLE -1x');
}

async function getExtendedStatus(path) {
  console.log(`📊 Getting extended status from ${path}...`);
  
  try {
    const response = await sendCommand(path, VTR_COMMANDS.EXTENDED_STATUS, 3000);
    console.log(`📥 Extended Status Response: ${response.toString('hex')}`);
    return response;
  } catch (error) {
    console.log(`❌ Extended status failed: ${error.message}`);
    return null;
  }
}

async function getDeviceType(path) {
  console.log(`🔍 Getting device type from ${path}...`);
  
  try {
    const response = await sendCommand(path, VTR_COMMANDS.DEVICE_TYPE, 3000);
    console.log(`📥 Device Type Response: ${response.toString('hex')}`);
    
    // Parse device type response
    if (response.length >= 4) {
      const deviceId = response[3];
      const deviceTypes = {
        0x10: 'BVW series',
        0x20: 'DVW series', 
        0x30: 'HDW series',
        0x40: 'J series',
        0x50: 'MSW series'
      };
      
      const deviceName = deviceTypes[deviceId] || `Unknown (0x${deviceId.toString(16)})`;
      console.log(`📺 Device Type: ${deviceName}`);
      return deviceName;
    }
    
    return 'Unknown';
  } catch (error) {
    console.log(`❌ Device type check failed: ${error.message}`);
    return null;
  }
}

/**
 * Check status of a specific VTR port
 * @param {string} path - VTR port path
 */
async function checkSingleVtr(path) {
  console.log(`\n🔍 Checking VTR at ${path}...`);
  
  try {
    const status = await getVtrStatus(path);
    
    if (status.error) {
      console.log(`❌ Error: ${status.error}`);
      return null;
    }
    
    console.log(`✅ VTR Found!`);
    console.log(`   📼 Timecode: ${status.timecode}`);
    console.log(`   ⚡ Mode: ${status.mode.toUpperCase()}`);
    console.log(`   🏃 Speed: ${status.speed}`);
    console.log(`   💾 Tape: ${status.tape ? 'IN' : 'OUT'}`);
    
    // If we have extended status, show it
    if (status.extended) {
      const readable = humanizeStatus(status, status.extended);
      console.log(`   📊 Status: ${readable}`);
    }
    
    return status;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return null;
  }
}

/**
 * Auto-scan all VTR ports and display results
 */
async function scanAllVtrs() {
  console.log('🔎 Scanning all VTR ports...');
  console.log(`📍 Checking ${VTR_PORTS.length} possible ports`);
  
  try {
    const foundVtrs = await autoScanVtrs();
    
    if (foundVtrs.length === 0) {
      console.log('\n❌ No VTRs detected on any port');
      console.log('💡 Make sure VTRs are:');
      console.log('   - Powered on');
      console.log('   - Connected via RS-422');
      console.log('   - Configured for serial control');
      return;
    }
    
    console.log(`\n✅ Found ${foundVtrs.length} VTR(s):`);
    
    foundVtrs.forEach((vtr, index) => {
      console.log(`\n📺 VTR #${index + 1} (${vtr.path})`);
      console.log(`   📼 Timecode: ${vtr.timecode}`);
      console.log(`   ⚡ Mode: ${vtr.mode.toUpperCase()}`);
      console.log(`   🏃 Speed: ${vtr.speed}`);
      console.log(`   💾 Tape: ${vtr.tape ? 'IN' : 'OUT'}`);
    });
    
  } catch (error) {
    console.log(`\n❌ Scan failed: ${error.message}`);
  }
}

/**
 * Enhanced control menu with HDW-specific commands
 */
async function controlVtr(path) {
  console.log(`\n🎮 HDW VTR Control Panel - ${path}`);
  console.log('=====================================');
  
  // First check device type
  await getDeviceType(path);
  
  // Check if VTR is responding
  try {
    const status = await getVtrStatus(path);
    console.log(`📊 Current Status: ${status.mode.toUpperCase()} - TC: ${status.timecode} - Tape: ${status.tape ? 'IN' : 'OUT'}`);
  } catch (error) {
    console.log(`❌ Cannot communicate with VTR: ${error.message}`);
    return;
  }
  
  console.log('\nTransport Commands:');
  console.log('  1. ▶️  Play');
  console.log('  2. ⏸️  Pause');
  console.log('  3. ⏹️  Stop');
  console.log('  4. ⏩ Fast Forward');
  console.log('  5. ⏪ Rewind');
  console.log('  6. 🔴 Record (CAUTION!)');
  console.log('  7. ⏏️  Eject');
  
  console.log('\nJog/Shuttle Commands:');
  console.log('  8. 🔄 Jog Forward');
  console.log('  9. 🔄 Jog Reverse');
  console.log(' 10. 🎯 Shuttle +1x');
  console.log(' 11. 🎯 Shuttle -1x');
  
  console.log('\nStatus Commands:');
  console.log(' 12. 📊 Check Status');
  console.log(' 13. 📈 Extended Status');
  console.log(' 14. 🔍 Device Type');
  console.log(' 15. 🚪 Exit');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const askCommand = () => {
    rl.question('\nEnter command number (1-15): ', async (answer) => {
      switch (answer.trim()) {
        case '1': await playVtr(path); break;
        case '2': await pauseVtr(path); break;
        case '3': await stopVtr(path); break;
        case '4': await fastForwardVtr(path); break;
        case '5': await rewindVtr(path); break;
        case '6':
          console.log('⚠️  Are you sure you want to record?');
          rl.question('Type "YES" to confirm: ', async (confirm) => {
            if (confirm === 'YES') await recordVtr(path);
            else console.log('❌ Record cancelled');
            askCommand();
          });
          return;
        case '7': await ejectTape(path); break;
        case '8': await jogForward(path); break;
        case '9': await jogReverse(path); break;
        case '10': await shuttlePlus1(path); break;
        case '11': await shuttleMinus1(path); break;
        case '12': await checkSingleVtr(path); break;
        case '13': await getExtendedStatus(path); break;
        case '14': await getDeviceType(path); break;
        case '15':
          console.log('👋 Exiting VTR control');
          rl.close();
          return;
        default:
          console.log('❌ Invalid command. Please enter 1-15.');
          break;
      }
      askCommand();
    });
  };
  
  askCommand();
}

/**
 * Batch control multiple VTRs
 * @param {Array} paths - Array of VTR port paths
 * @param {string} command - Command to send (play, pause, stop)
 */
async function batchControlVtrs(paths, command) {
  console.log(`🎬 Sending ${command.toUpperCase()} to ${paths.length} VTRs...`);
  
  const commandMap = {
    'play': playVtr,
    'pause': pauseVtr,
    'stop': stopVtr,
    'ff': fastForwardVtr,
    'rew': rewindVtr
  };
  
  const commandFunction = commandMap[command.toLowerCase()];
  if (!commandFunction) {
    console.log(`❌ Unknown command: ${command}`);
    return;
  }
  
  const results = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    console.log(`\n📺 VTR ${i + 1}/${paths.length} (${path})`);
    const success = await commandFunction(path);
    results.push({ path, success });
    
    // Small delay between commands
    if (i < paths.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Summary
  console.log(`\n📋 Batch ${command.toUpperCase()} Summary:`);
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`   ${status} VTR ${index + 1} (${result.path})`);
  });
}

/**
 * Test VTR commands
 */
async function testVtrCommands(path) {
  console.log(`🧪 Testing VTR commands on ${path}`);
  
  const commands = [
    { name: 'Status', cmd: VTR_COMMANDS.STATUS },
    { name: 'Play', cmd: VTR_COMMANDS.PLAY },
    { name: 'Pause', cmd: VTR_COMMANDS.PAUSE },
    { name: 'Stop', cmd: VTR_COMMANDS.STOP },
    { name: 'Timecode', cmd: VTR_COMMANDS.TIMECODE }
  ];
  
  for (const { name, cmd } of commands) {
    try {
      console.log(`\n📤 Sending ${name} command...`);
      const response = await sendCommand(path, cmd, 3000);
      console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
      
      // Wait between commands
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`❌ ${name} failed: ${error.message}`);
    }
  }
}

/**
 * Enhanced interactive checker with control options
 */
async function interactiveCheck() {
  const args = process.argv.slice(2);
  
  console.log('🎬 VTR Status Checker & Controller');
  console.log('==================================');
  
  if (args.length === 0) {
    // No arguments - scan all ports
    await scanAllVtrs();
  } else if (args[0] === '--help' || args[0] === '-h') {
    // Show help
    console.log('\nUsage:');
    console.log('  node tests/check_vtr_status.js                    # Scan all ports');
    console.log('  node tests/check_vtr_status.js /dev/ttyRP0        # Check specific port');
    console.log('  node tests/check_vtr_status.js --control /dev/ttyRP0  # Control VTR');
    console.log('  node tests/check_vtr_status.js --play /dev/ttyRP0     # Send play command');
    console.log('  node tests/check_vtr_status.js --pause /dev/ttyRP0    # Send pause command');
    console.log('  node tests/check_vtr_status.js --stop /dev/ttyRP0     # Send stop command');
    console.log('  node tests/check_vtr_status.js --batch play port1 port2  # Batch control');
    console.log('  node tests/check_vtr_status.js --list             # List all possible ports');
    console.log('  node tests/check_vtr_status.js --monitor /dev/ttyRP0  # Monitor VTR');
    console.log('  node tests/check_vtr_status.js --test /dev/ttyRP0     # Test commands');
    
  } else if (args[0] === '--control' || args[0] === '-c') {
    // Interactive control mode
    const port = args[1] || VTR_PORTS[0];
    await controlVtr(port);
    
  } else if (args[0] === '--play') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --play /dev/ttyRP0');
      return;
    }
    await playVtr(port);
    
  } else if (args[0] === '--pause') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --pause /dev/ttyRP0');
      return;
    }
    await pauseVtr(port);
    
  } else if (args[0] === '--stop') {
    const port = args[1];
    if (!port) {
      console.log('❌ Please specify a port: --stop /dev/ttyRP0');
      return;
    }
    await stopVtr(port);
    
  } else if (args[0] === '--batch') {
    const command = args[1];
    const ports = args.slice(2);
    if (!command || ports.length === 0) {
      console.log('❌ Usage: --batch <command> <port1> [port2] ...');
      console.log('   Commands: play, pause, stop, ff, rew');
      return;
    }
    await batchControlVtrs(ports, command);
    
  } else if (args[0] === '--list' || args[0] === '-l') {
    // List all possible ports
    console.log('\n📍 Available VTR ports:');
    VTR_PORTS.forEach((port, index) => {
      console.log(`   ${index + 1}. ${port}`);
    });
    
  } else {
    // Check specific port
    const targetPort = args[0];
    
    if (!VTR_PORTS.includes(targetPort)) {
      console.log(`⚠️  Warning: ${targetPort} is not in the standard VTR port list`);
      console.log('   Checking anyway...');
    }
    
    await checkSingleVtr(targetPort);
  }
}

// Continuous monitoring mode
async function monitorVtr(path, interval = 2000) {
  console.log(`📡 Monitoring VTR at ${path} (${interval}ms intervals)`);
  console.log('Press Ctrl+C to stop\n');
  
  let lastStatus = null;
  
  const monitor = async () => {
    try {
      const status = await getVtrStatus(path);
      
      // Only log if status changed
      if (!lastStatus || 
          lastStatus.timecode !== status.timecode ||
          lastStatus.mode !== status.mode ||
          lastStatus.speed !== status.speed ||
          lastStatus.tape !== status.tape) {
        
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] TC:${status.timecode} ${status.mode.toUpperCase()} ${status.speed} ${status.tape ? 'TAPE' : 'NO-TAPE'}`);
        lastStatus = status;
      }
      
    } catch (error) {
      console.log(`[${new Date().toLocaleTimeString()}] ❌ ${error.message}`);
    }
  };
  
  // Initial check
  await monitor();
  
  // Set up interval
  const intervalId = setInterval(monitor, interval);
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log('\n👋 Monitoring stopped');
    process.exit(0);
  });
}

/**
 * Main execution
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--monitor') || args.includes('-m')) {
    const portIndex = args.findIndex(arg => arg === '--monitor' || arg === '-m');
    const port = args[portIndex + 1] || VTR_PORTS[0];
    const interval = parseInt(args[portIndex + 2]) || 2000;
    monitorVtr(port, interval);
  } else if (args.includes('--test') || args.includes('-t')) {
    const portIndex = args.findIndex(arg => arg === '--test' || arg === '-t');
    const port = args[portIndex + 1] || VTR_PORTS[0];
    testVtrCommands(port);
  } else {
    interactiveCheck();
  }
}

module.exports = {
  checkSingleVtr,
  scanAllVtrs,
  monitorVtr,
  testVtrCommands,
  playVtr,
  pauseVtr,
  stopVtr,
  recordVtr,
  fastForwardVtr,
  rewindVtr,
  ejectTape,
  jogForward,
  jogReverse,
  shuttlePlus1,
  shuttleMinus1,
  getExtendedStatus,
  getDeviceType,
  controlVtr,
  batchControlVtrs,
  sendVtrCommand,
  VTR_COMMANDS
};