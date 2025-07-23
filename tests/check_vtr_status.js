const { autoScanVtrs, getVtrStatus, VTR_PORTS, humanizeStatus } = require('../src/commands/vtr_interface');

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
 * Interactive VTR status checker
 */
async function interactiveCheck() {
  const args = process.argv.slice(2);
  
  console.log('🎬 VTR Status Checker');
  console.log('==================');
  
  if (args.length === 0) {
    // No arguments - scan all ports
    await scanAllVtrs();
  } else if (args[0] === '--help' || args[0] === '-h') {
    // Show help
    console.log('\nUsage:');
    console.log('  node tests/check_vtr_status.js           # Scan all ports');
    console.log('  node tests/check_vtr_status.js /dev/ttyRP0  # Check specific port');
    console.log('  node tests/check_vtr_status.js --list       # List all possible ports');
    console.log('  node tests/check_vtr_status.js --help       # Show this help');
    
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

/**
 * Continuous monitoring mode
 */
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
 * Test VTR commands
 */
async function testVtrCommands(path) {
  console.log(`🧪 Testing VTR commands on ${path}`);
  
  const commands = [
    { name: 'Status', cmd: Buffer.from([0x88, 0x01, 0x61, 0xFF]) },
    { name: 'Play', cmd: Buffer.from([0x88, 0x01, 0x2C, 0xFF]) },
    { name: 'Stop', cmd: Buffer.from([0x88, 0x01, 0x20, 0xFF]) },
    { name: 'Timecode', cmd: Buffer.from([0x88, 0x01, 0x74, 0xFF]) }
  ];
  
  for (const { name, cmd } of commands) {
    try {
      console.log(`\n📤 Sending ${name} command...`);
      const response = await require('../src/commands/vtr_interface').sendCommand(path, cmd, 3000);
      console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
    } catch (error) {
      console.log(`❌ ${name} failed: ${error.message}`);
    }
  }
}

// Main execution
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
  testVtrCommands
};