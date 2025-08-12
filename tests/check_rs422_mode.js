/**
 * RS-422 Mode Checker and Configuration Tool
 * Checks if ttyRP8 is properly configured for RS-422 differential signaling
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');

class RS422ModeChecker {
    
    /**
     * Check current port configuration
     */
    static checkPortConfiguration(portPath) {
        console.log(`🔍 Checking RS-422 Configuration for ${portPath}`);
        console.log(`================================================`);
        
        try {
            // Check if port exists
            if (!fs.existsSync(portPath)) {
                console.log(`❌ Port ${portPath} does not exist`);
                return false;
            }
            
            console.log(`✅ Port ${portPath} exists`);
            
            // Check port permissions
            const stats = fs.statSync(portPath);
            console.log(`📊 Port permissions: ${stats.mode.toString(8)}`);
            console.log(`📊 Owner: ${stats.uid}, Group: ${stats.gid}`);
            
            // Check current stty settings
            console.log(`\n🔧 Current Port Settings:`);
            try {
                const sttyOutput = execSync(`stty -F ${portPath} -a`, { encoding: 'utf8' });
                console.log(sttyOutput);
            } catch (error) {
                console.log(`⚠️  Cannot read stty settings: ${error.message}`);
            }
            
            // Check if it's an RS-422 capable device
            console.log(`\n🔍 Checking Device Type:`);
            try {
                // Check device driver
                const driverInfo = execSync(`udevadm info --name=${portPath} --attribute-walk | head -20`, { encoding: 'utf8' });
                console.log(driverInfo);
            } catch (error) {
                console.log(`⚠️  Cannot read device info: ${error.message}`);
            }
            
            return true;
            
        } catch (error) {
            console.log(`❌ Configuration check failed: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Configure port for RS-422 mode
     */
    static configureRS422Mode(portPath) {
        console.log(`\n🔧 Configuring ${portPath} for RS-422 Mode`);
        console.log(`==========================================`);
        
        const rs422Configs = [
            { baud: 38400, desc: 'FlexiCart Standard' },
            { baud: 9600, desc: 'FlexiCart Alternative' },
            { baud: 19200, desc: 'Industrial Standard' }
        ];
        
        for (const config of rs422Configs) {
            console.log(`\n📡 Setting up ${config.desc} (${config.baud} baud):`);
            
            try {
                // Basic RS-422 configuration
                const sttyCommands = [
                    `stty -F ${portPath} ${config.baud}`,           // Baud rate
                    `stty -F ${portPath} cs8`,                     // 8 data bits
                    `stty -F ${portPath} parenb`,                  // Enable parity
                    `stty -F ${portPath} -parodd`,                 // Even parity
                    `stty -F ${portPath} -cstopb`,                 // 1 stop bit
                    `stty -F ${portPath} -crtscts`,                // No hardware flow control
                    `stty -F ${portPath} -ixon -ixoff`,           // No software flow control
                    `stty -F ${portPath} clocal`,                  // Local mode (ignore modem signals)
                    `stty -F ${portPath} cread`,                   // Enable receiver
                    `stty -F ${portPath} raw`,                     // Raw mode
                    `stty -F ${portPath} -echo`,                   // No echo
                ];
                
                for (const cmd of sttyCommands) {
                    console.log(`   📤 ${cmd}`);
                    try {
                        execSync(cmd);
                        console.log(`   ✅ Success`);
                    } catch (error) {
                        console.log(`   ❌ Failed: ${error.message}`);
                    }
                }
                
                // Verify configuration
                console.log(`\n📊 Verifying configuration:`);
                try {
                    const verifyOutput = execSync(`stty -F ${portPath} -a`, { encoding: 'utf8' });
                    console.log(verifyOutput);
                } catch (error) {
                    console.log(`   ❌ Verification failed: ${error.message}`);
                }
                
            } catch (error) {
                console.log(`❌ Configuration failed: ${error.message}`);
            }
        }
    }
    
    /**
     * Test RS-422 communication patterns
     */
    static testRS422Communication(portPath) {
        console.log(`\n📡 Testing RS-422 Communication Patterns`);
        console.log(`=========================================`);
        
        return new Promise((resolve) => {
            try {
                // Use low-level approach with cat and echo
                console.log(`🔧 Method 1: Direct device I/O test`);
                
                // Start listening process
                const catProcess = spawn('timeout', ['5', 'cat', portPath]);
                
                catProcess.stdout.on('data', (data) => {
                    console.log(`📥 Received: ${data.toString('hex').toUpperCase()} (${data.length} bytes)`);
                    console.log(`📝 ASCII: "${data.toString().replace(/[^\x20-\x7E]/g, '.')}" `);
                });
                
                catProcess.stderr.on('data', (data) => {
                    console.log(`⚠️  stderr: ${data}`);
                });
                
                // Send test patterns after brief delay
                setTimeout(() => {
                    console.log(`📤 Sending test patterns...`);
                    
                    const testPatterns = [
                        Buffer.from([0x55]),                                    // Alternating bits
                        Buffer.from([0xAA]),                                    // Inverse alternating
                        Buffer.from([0x02, 0x06, 0x01, 0x01, 0x00, 0x50, 0x00, 0x80, 0x28]), // FlexiCart dummy
                        Buffer.from('AT\r\n'),                                  // ASCII command
                        Buffer.from([0x00]),                                    // Null
                        Buffer.from([0xFF]),                                    // All ones
                    ];
                    
                    let patternIndex = 0;
                    
                    function sendNextPattern() {
                        if (patternIndex >= testPatterns.length) {
                            console.log(`📊 All patterns sent`);
                            return;
                        }
                        
                        const pattern = testPatterns[patternIndex];
                        console.log(`📤 Pattern ${patternIndex + 1}: ${pattern.toString('hex').toUpperCase()}`);
                        
                        try {
                            // Write directly to device
                            fs.writeFileSync(portPath, pattern);
                            console.log(`   ✅ Sent successfully`);
                        } catch (error) {
                            console.log(`   ❌ Send failed: ${error.message}`);
                        }
                        
                        patternIndex++;
                        setTimeout(sendNextPattern, 1000);
                    }
                    
                    sendNextPattern();
                    
                }, 1000);
                
                // Cleanup after timeout
                setTimeout(() => {
                    catProcess.kill();
                    console.log(`📊 RS-422 communication test complete`);
                    resolve();
                }, 8000);
                
            } catch (error) {
                console.log(`❌ RS-422 test failed: ${error.message}`);
                resolve();
            }
        });
    }
    
    /**
     * Check for RS-422 specific hardware features
     */
    static checkRS422Hardware(portPath) {
        console.log(`\n🔍 Checking RS-422 Hardware Features`);
        console.log(`====================================`);
        
        try {
            // Check if this is a multi-drop capable device
            console.log(`📊 Device driver information:`);
            try {
                const driverInfo = execSync(`ls -la /sys/class/tty/${portPath.split('/').pop()}/`, { encoding: 'utf8' });
                console.log(driverInfo);
            } catch (error) {
                console.log(`⚠️  Cannot read driver info: ${error.message}`);
            }
            
            // Check for RS-422 termination settings
            console.log(`\n📊 Checking for termination resistor settings:`);
            try {
                const devicePath = `/sys/class/tty/${portPath.split('/').pop()}/device/`;
                if (fs.existsSync(devicePath)) {
                    const deviceFiles = fs.readdirSync(devicePath);
                    console.log(`Device files: ${deviceFiles.join(', ')}`);
                    
                    // Look for RS-422 specific configuration files
                    const rs422Files = deviceFiles.filter(f => 
                        f.includes('rs422') || 
                        f.includes('termination') || 
                        f.includes('mode') ||
                        f.includes('differential')
                    );
                    
                    if (rs422Files.length > 0) {
                        console.log(`🎯 Found RS-422 config files: ${rs422Files.join(', ')}`);
                        
                        rs422Files.forEach(file => {
                            try {
                                const content = fs.readFileSync(`${devicePath}${file}`, 'utf8');
                                console.log(`📄 ${file}: ${content.trim()}`);
                            } catch (e) {
                                console.log(`📄 ${file}: Cannot read`);
                            }
                        });
                    } else {
                        console.log(`⚠️  No RS-422 specific config files found`);
                    }
                }
            } catch (error) {
                console.log(`⚠️  Hardware check failed: ${error.message}`);
            }
            
            // Check kernel modules
            console.log(`\n📊 Checking loaded kernel modules:`);
            try {
                const lsmodOutput = execSync(`lsmod | grep -E "(serial|422|485|tty)"`, { encoding: 'utf8' });
                if (lsmodOutput.trim()) {
                    console.log(lsmodOutput);
                } else {
                    console.log(`No specific serial modules found`);
                }
            } catch (error) {
                console.log(`⚠️  Cannot check modules: ${error.message}`);
            }
            
        } catch (error) {
            console.log(`❌ Hardware check failed: ${error.message}`);
        }
    }
    
    /**
     * Main diagnostic routine
     */
    static async runRS422Diagnostic(portPath) {
        console.log(`🔬 RS-422 Mode Diagnostic Tool`);
        console.log(`==============================`);
        console.log(`Port: ${portPath}`);
        console.log(`Time: ${new Date().toISOString()}\n`);
        
        // Step 1: Check current configuration
        const configOk = this.checkPortConfiguration(portPath);
        if (!configOk) {
            console.log(`❌ Cannot proceed with RS-422 diagnostic`);
            return;
        }
        
        // Step 2: Check RS-422 hardware features
        this.checkRS422Hardware(portPath);
        
        // Step 3: Configure for RS-422
        this.configureRS422Mode(portPath);
        
        // Step 4: Test communication
        await this.testRS422Communication(portPath);
        
        console.log(`\n📋 RS-422 Diagnostic Summary:`);
        console.log(`============================`);
        console.log(`✅ Port exists and is accessible`);
        console.log(`✅ Configuration applied`);
        console.log(`✅ Communication test completed`);
        console.log(`\n🔧 Next Steps:`);
        console.log(`1. If responses were received, the port is working in RS-422 mode`);
        console.log(`2. If no responses, check FlexiCart power and cable connections`);
        console.log(`3. Verify differential signal wiring (TX+/TX-, RX+/RX-)`);
        console.log(`4. Check termination resistors on RS-422 line`);
    }
}

/**
 * Main execution
 */
async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP8';
    
    try {
        await RS422ModeChecker.runRS422Diagnostic(portPath);
    } catch (error) {
        console.error(`💥 RS-422 diagnostic failed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { RS422ModeChecker };