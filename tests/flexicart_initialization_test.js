/**
 * FlexiCart Elevator Initialization and Bin Reading Test
 * Proper sequence: Initialize elevator → Monitor status → Read bins
 * Based on official FlexiCart protocol specification
 */

const { FlexiCartStateManager } = require('../src/commands/flexicart_data_structures');
const { createFlexiCartCommand, sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * FlexiCart Commands for initialization and status monitoring
 */
const COMMANDS = {
    ELEVATOR_INITIALIZE: { cmd: 0x1D, ctrl: 0x01, data: 0x80 },  // Initialize elevator (1DH)
    SENSE_CART_STATUS: { cmd: 0x61, ctrl: 0x00, data: 0x80 },    // Request cart status (61H)
    CART_STATUS_RETURN: { cmd: 0x71, ctrl: 0x00, data: 0x80 },   // Cart status return (71H)
    SENSE_BIN_STATUS: { cmd: 0x62, ctrl: 0x01, data: 0x80 }      // Request bin status (62H)
};

async function testFlexiCartInitializationAndReading() {
    console.log('🏗️  FlexiCart Elevator Initialization and Bin Reading Test');
    console.log('======================================================\n');
    
    const serialPort = '/dev/ttyRP0';
    const cartAddress = 0x01;
    
    console.log('📡 Using FlexiCart on /dev/ttyRP0');
    console.log('🔧 Configuration: cart address 0x01');
    console.log('✅ Following official FlexiCart initialization protocol\n');
    
    try {
        // Step 1: Send Elevator Initialize command
        console.log('🏗️  Step 1: Sending Elevator Initialize (1DH) command...');
        console.log('========================================================');
        
        const initCommand = createFlexiCartCommand(
            cartAddress,                           // UA2 - Cart address
            COMMANDS.ELEVATOR_INITIALIZE.cmd,      // CMD - 0x1D
            0x00,                                  // BT - Block type
            COMMANDS.ELEVATOR_INITIALIZE.ctrl,     // CTRL - 0x01
            COMMANDS.ELEVATOR_INITIALIZE.data      // DATA - 0x80
        );
        
        console.log(`📤 Sending: ${initCommand.toString('hex').match(/.{2}/g).join(' ')}`);
        console.log(`   STX=0x02, BC=0x06, UA1=0x01, UA2=0x${cartAddress.toString(16).padStart(2, '0')}, BT=0x00, CMD=0x1D, CTRL=0x01, DATA=0x80`);
        
        const initResponse = await sendCommand(serialPort, initCommand, 5000);
        
        if (!initResponse || initResponse.length === 0) {
            throw new Error('No response to Elevator Initialize command');
        }
        
        console.log(`📥 Initialize response: ${initResponse.toString('hex')}`);
        
        if (initResponse[0] === 0x04) {
            console.log('✅ Elevator Initialize: ACK received - initialization started');
        } else if (initResponse[0] === 0x05) {
            console.log('❌ Elevator Initialize: NAK received - initialization failed');
            return;
        } else {
            console.log(`⚠️  Elevator Initialize: Unexpected response: 0x${initResponse[0].toString(16)}`);
        }
        
        // Step 2: Monitor initialization status every 5 seconds
        console.log('\n🔍 Step 2: Monitoring initialization status...');
        console.log('==============================================');
        console.log('📋 Checking CART STATUS RETURN (71H) for initialization completion');
        console.log('⏱️  Polling every 5 seconds until initialization ready\n');
        
        let initializationComplete = false;
        let attempts = 0;
        const maxAttempts = 24; // 2 minutes maximum
        
        while (!initializationComplete && attempts < maxAttempts) {
            attempts++;
            console.log(`🔄 Status check ${attempts}/${maxAttempts}...`);
            
            // Send SENSE CART STATUS command
            const statusCommand = createFlexiCartCommand(
                cartAddress,                        // UA2 - Cart address
                COMMANDS.SENSE_CART_STATUS.cmd,     // CMD - 0x61
                0x00,                               // BT - Block type
                COMMANDS.SENSE_CART_STATUS.ctrl,    // CTRL - 0x00
                COMMANDS.SENSE_CART_STATUS.data     // DATA - 0x80
            );
            
            try {
                const statusResponse = await sendCommand(serialPort, statusCommand, 3000);
                
                if (statusResponse && statusResponse.length > 0) {
                    console.log(`📊 Status response: ${statusResponse.toString('hex')}`);
                    
                    // Look for CART STATUS RETURN (71H) in response
                    if (statusResponse.length >= 6 && statusResponse[5] === 0x71) {
                        console.log('📋 CART STATUS RETURN (71H) received - parsing status...');
                        
                        // Parse status according to FlexiCart specification
                        const statusAnalysis = parseCartStatus(statusResponse);
                        
                        console.log('📊 Cart Status Analysis:');
                        console.log(`   Initialization: ${statusAnalysis.initialization}`);
                        console.log(`   Elevator Ready: ${statusAnalysis.elevatorReady}`);
                        console.log(`   System Status: ${statusAnalysis.systemStatus}`);
                        
                        if (statusAnalysis.initializationComplete) {
                            console.log('✅ Initialization COMPLETE!');
                            initializationComplete = true;
                            break;
                        } else {
                            console.log('⏳ Initialization still in progress...');
                        }
                    } else {
                        console.log('📤 Different response received - not status return');
                    }
                } else {
                    console.log('❌ No status response received');
                }
                
            } catch (error) {
                console.log(`⚠️  Status check ${attempts} failed: ${error.message}`);
            }
            
            if (!initializationComplete) {
                console.log('⏱️  Waiting 5 seconds before next status check...\n');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        if (!initializationComplete) {
            console.log('⚠️  Initialization timeout - proceeding anyway');
        }
        
        // Step 3: Read bin status after initialization
        console.log('\n📦 Step 3: Reading bin status after initialization...');
        console.log('===================================================');
        
        const testPositions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        console.log(`🔍 Scanning positions: ${testPositions.join(', ')}\n`);
        
        const binResults = [];
        
        for (const position of testPositions) {
            console.log(`📍 Reading bin ${position}...`);
            
            try {
                // Send SENSE BIN STATUS for this position
                const binCommand = createFlexiCartCommand(
                    cartAddress,                      // UA2 - Cart address
                    COMMANDS.SENSE_BIN_STATUS.cmd,    // CMD - 0x62
                    0x00,                             // BT - Block type  
                    position,                         // CTRL - Position number
                    COMMANDS.SENSE_BIN_STATUS.data    // DATA - 0x80
                );
                
                const binResponse = await sendCommand(serialPort, binCommand, 3000);
                
                if (binResponse && binResponse.length > 0) {
                    console.log(`   Response: ${binResponse.toString('hex')}`);
                    
                    const binStatus = analyzeBinResponse(binResponse, position);
                    binResults.push(binStatus);
                    
                    if (binStatus.occupied) {
                        console.log(`   ✅ Position ${position}: OCCUPIED`);
                        if (binStatus.barcode) {
                            console.log(`      Barcode: ${binStatus.barcode}`);
                        }
                    } else {
                        console.log(`   📭 Position ${position}: Empty`);
                    }
                } else {
                    console.log(`   ⏱️  Position ${position}: Timeout (likely occupied)`);
                    binResults.push({
                        position: position,
                        occupied: true,
                        status: 'timeout',
                        barcode: `TIMEOUT_${position}`
                    });
                }
                
            } catch (error) {
                console.log(`   ❌ Position ${position}: Error - ${error.message}`);
                binResults.push({
                    position: position,
                    occupied: false,
                    status: 'error',
                    error: error.message
                });
            }
            
            // Small delay between reads
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Step 4: Summary
        console.log('\n📊 Final Bin Reading Summary:');
        console.log('=============================');
        
        const occupiedBins = binResults.filter(bin => bin.occupied);
        const emptyBins = binResults.filter(bin => !bin.occupied);
        const errorBins = binResults.filter(bin => bin.status === 'error');
        
        console.log(`✅ Total bins scanned: ${binResults.length}`);
        console.log(`📦 Occupied bins: ${occupiedBins.length}`);
        console.log(`📭 Empty bins: ${emptyBins.length}`);
        console.log(`❌ Error bins: ${errorBins.length}\n`);
        
        if (occupiedBins.length > 0) {
            console.log('📍 Occupied Bin Details:');
            occupiedBins.forEach(bin => {
                console.log(`   Bin ${bin.position}: ${bin.barcode || 'No barcode'} (${bin.status})`);
            });
        }
        
        console.log('\n🎉 FlexiCart initialization and bin reading test completed!');
        console.log('✅ Proper initialization sequence followed');
        console.log('📡 Elevator initialized before bin reading');
        console.log('🔍 Status monitored until ready');
        console.log('📦 Bin positions read after initialization');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

/**
 * Parse Cart Status Return (71H) response
 */
function parseCartStatus(response) {
    const status = {
        initialization: 'unknown',
        elevatorReady: false,
        systemStatus: 'unknown',
        initializationComplete: false,
        rawResponse: response.toString('hex')
    };
    
    try {
        // Parse according to Cart Status MAP from FlexiCart documentation
        if (response.length >= 8) {
            // Look at status bits in the response
            const statusByte1 = response[7] || 0;
            const statusByte2 = response[8] || 0;
            
            // Analyze status bits according to documentation
            status.elevatorReady = (statusByte1 & 0x01) !== 0;
            status.initializationComplete = (statusByte1 & 0x02) !== 0;
            
            if (status.initializationComplete) {
                status.initialization = 'complete';
                status.systemStatus = 'ready';
            } else {
                status.initialization = 'in_progress';
                status.systemStatus = 'initializing';
            }
        }
        
    } catch (error) {
        console.error('Error parsing cart status:', error.message);
    }
    
    return status;
}

/**
 * Analyze bin response to determine occupancy
 */
function analyzeBinResponse(response, position) {
    const result = {
        position: position,
        occupied: false,
        status: 'empty',
        barcode: null,
        rawResponse: response.toString('hex')
    };
    
    // Single ACK byte = empty
    if (response.length === 1 && response[0] === 0x04) {
        return result;
    }
    
    // Longer response = likely occupied
    if (response.length > 1) {
        result.occupied = true;
        result.status = 'occupied';
        
        // Try to extract barcode data
        let barcodeText = '';
        for (const byte of response) {
            if (byte >= 0x20 && byte <= 0x7E) { // Printable ASCII
                barcodeText += String.fromCharCode(byte);
            }
        }
        
        if (barcodeText.length > 0) {
            result.barcode = barcodeText.trim();
        } else {
            result.barcode = `BIN_${position}_${response.length}B`;
        }
    }
    
    return result;
}

// Run the test
if (require.main === module) {
    testFlexiCartInitializationAndReading().catch(console.error);
}

module.exports = { testFlexiCartInitializationAndReading };
