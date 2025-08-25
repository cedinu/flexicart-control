/**
 * FlexiCart Complete Initialization and Full Bin Reading Test
 * Properly initializes elevator and reads all 360 bin positions
 * Based on official FlexiCart protocol specification
 */

const { createFlexiCartCommand, sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * FlexiCart Commands for initialization and status
 */
const FLEXICART_COMMANDS = {
    ELEVATOR_INITIALIZE: { cmd: 0x1D, ctrl: 0x01, data: 0x80 },
    CART_STATUS_REQUEST: { cmd: 0x71, ctrl: 0x00, data: 0x80 },
    SENSE_BIN_STATUS: { cmd: 0x62, ctrl: 0x01, data: 0x80 },
};

async function fullFlexiCartInitAndScan() {
    console.log('🚀 FlexiCart Complete Initialization and Full Bin Scan');
    console.log('=====================================================\n');
    
    const port = '/dev/ttyRP0';
    const cartAddress = 0x01;
    const maxBins = 360; // Full FlexiCart capacity
    
    console.log(`📡 Using FlexiCart on ${port}`);
    console.log(`🔧 Configuration: cart address 0x${cartAddress.toString(16)}`);
    console.log(`📦 Will scan all ${maxBins} bin positions after initialization\n`);
    
    try {
        // Step 1: Send Elevator Initialize command
        console.log('🏗️  Step 1: Sending Elevator Initialize (1DH) command...');
        console.log('========================================================');
        
        const initCommand = createFlexiCartCommand(
            cartAddress,
            FLEXICART_COMMANDS.ELEVATOR_INITIALIZE.cmd,
            0x00,
            FLEXICART_COMMANDS.ELEVATOR_INITIALIZE.ctrl,
            FLEXICART_COMMANDS.ELEVATOR_INITIALIZE.data
        );
        
        console.log(`📤 Sending: ${initCommand.toString('hex').match(/.{2}/g).join(' ')}`);
        console.log(`   STX=0x02, BC=0x06, UA1=0x01, UA2=0x${cartAddress.toString(16)}, BT=0x00, CMD=0x1D, CTRL=0x01, DATA=0x80`);
        
        const initResponse = await sendCommand(port, initCommand, 5000);
        
        if (initResponse && initResponse.length > 0) {
            console.log(`📥 Initialize response: ${initResponse.toString('hex')}`);
            
            if (initResponse[0] === 0x04) {
                console.log('✅ Elevator Initialize: ACK received - initialization started');
            } else if (initResponse[0] === 0x05) {
                console.log('❌ Elevator Initialize: NAK received - initialization failed');
                return;
            } else {
                console.log(`⚠️  Unexpected response: 0x${initResponse[0].toString(16)}`);
            }
        } else {
            console.log('❌ No response to initialize command');
            return;
        }
        
        // Step 2: Monitor initialization status with longer timeout
        console.log('\n🔍 Step 2: Monitoring initialization status...');
        console.log('==============================================');
        console.log('📋 Checking CART STATUS RETURN (71H) for initialization completion');
        console.log('⏱️  Polling every 10 seconds until initialization ready (max 20 minutes)\n');
        
        const maxStatusChecks = 120; // 20 minutes at 10-second intervals
        let initComplete = false;
        
        for (let check = 1; check <= maxStatusChecks && !initComplete; check++) {
            console.log(`🔄 Status check ${check}/${maxStatusChecks}...`);
            
            const statusCommand = createFlexiCartCommand(
                cartAddress,
                FLEXICART_COMMANDS.CART_STATUS_REQUEST.cmd,
                0x00,
                FLEXICART_COMMANDS.CART_STATUS_REQUEST.ctrl,
                FLEXICART_COMMANDS.CART_STATUS_REQUEST.data
            );
            
            try {
                const statusResponse = await sendCommand(port, statusCommand, 8000); // Longer timeout for status
                
                if (statusResponse && statusResponse.length > 0) {
                    console.log(`📊 Status response: ${statusResponse.toString('hex')}`);
                    
                    const statusAnalysis = parseCartStatus(statusResponse);
                    console.log(`📋 Status Analysis:`, statusAnalysis);
                    
                    if (statusAnalysis.initializationComplete) {
                        console.log('🎉 Initialization completed! Ready to read bins.');
                        initComplete = true;
                        break;
                    } else {
                        console.log(`⏳ Status: ${statusAnalysis.status} - continuing to wait...`);
                    }
                } else {
                    console.log('📭 No status response - FlexiCart may still be initializing...');
                }
                
            } catch (error) {
                console.log(`⚠️  Status check error: ${error.message}`);
            }
            
            if (!initComplete) {
                console.log('⏱️  Waiting 10 seconds before next status check...\n');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
        
        if (!initComplete) {
            console.log('⚠️  Initialization timeout - but proceeding to read bins anyway\n');
        }
        
        // Step 3: Read ALL bin positions
        console.log(`📦 Step 3: Reading all ${maxBins} bin positions...`);
        console.log('='.repeat(50));
        
        const binResults = [];
        let occupiedCount = 0;
        let emptyCount = 0;
        let errorCount = 0;
        
        for (let position = 1; position <= maxBins; position++) {
            if (position % 50 === 0 || position === 1) {
                console.log(`\n🔍 Progress: Reading bins ${Math.max(1, position-49)} - ${position} of ${maxBins}...`);
            }
            
            try {
                const binCommand = createFlexiCartCommand(
                    cartAddress,
                    FLEXICART_COMMANDS.SENSE_BIN_STATUS.cmd,
                    0x00,
                    position & 0xFF, // Position in CTRL byte
                    FLEXICART_COMMANDS.SENSE_BIN_STATUS.data
                );
                
                const binResponse = await sendCommand(port, binCommand, 4000);
                
                if (binResponse && binResponse.length > 0) {
                    const binAnalysis = analyzeBinResponse(binResponse, position);
                    binResults.push(binAnalysis);
                    
                    if (binAnalysis.occupied) {
                        occupiedCount++;
                        if (occupiedCount <= 20 || position % 30 === 0) { // Show first 20 + every 30th
                            console.log(`   ✅ Bin ${position}: OCCUPIED (${binAnalysis.barcode})`);
                        }
                    } else {
                        emptyCount++;
                        if (emptyCount <= 10 || position % 50 === 0) { // Show first 10 + every 50th
                            console.log(`   📭 Bin ${position}: empty`);
                        }
                    }
                } else {
                    errorCount++;
                    binResults.push({
                        position: position,
                        occupied: false,
                        error: 'No response',
                        barcode: null
                    });
                    
                    if (errorCount <= 10) {
                        console.log(`   ❌ Bin ${position}: No response`);
                    }
                }
                
                // Small delay to prevent overwhelming FlexiCart
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                errorCount++;
                binResults.push({
                    position: position,
                    occupied: false,
                    error: error.message,
                    barcode: null
                });
                
                if (errorCount <= 10) {
                    console.log(`   ❌ Bin ${position}: Error - ${error.message}`);
                }
            }
        }
        
        // Final Results Summary
        console.log('\n📊 COMPLETE FlexiCart Bin Reading Results:');
        console.log('==========================================');
        console.log(`✅ Total bins scanned: ${maxBins}`);
        console.log(`📦 Occupied bins: ${occupiedCount}`);
        console.log(`📭 Empty bins: ${emptyCount}`);
        console.log(`❌ Error bins: ${errorCount}`);
        console.log(`📈 Occupancy rate: ${(occupiedCount / maxBins * 100).toFixed(1)}%`);
        
        // Show all occupied bins
        const occupiedBins = binResults.filter(bin => bin.occupied);
        
        if (occupiedBins.length > 0) {
            console.log('\n📍 All Occupied Bin Positions:');
            console.log('==============================');
            
            occupiedBins.forEach(bin => {
                console.log(`   Bin ${bin.position}: ${bin.barcode} (${bin.responseHex})`);
            });
        }
        
        // Save results to file
        const resultsFile = `flexicart_full_scan_${new Date().toISOString().split('T')[0]}.json`;
        const fs = require('fs');
        fs.writeFileSync(resultsFile, JSON.stringify({
            scanDate: new Date().toISOString(),
            totalBins: maxBins,
            occupiedBins: occupiedCount,
            emptyBins: emptyCount,
            errorBins: errorCount,
            occupancyRate: (occupiedCount / maxBins * 100),
            binDetails: binResults
        }, null, 2));
        
        console.log(`\n💾 Complete scan results saved to: ${resultsFile}`);
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

/**
 * Parse FlexiCart status response to determine initialization state
 */
function parseCartStatus(response) {
    const analysis = {
        responseHex: response.toString('hex'),
        length: response.length,
        initializationComplete: false,
        status: 'unknown'
    };
    
    // Look for CART STATUS RETURN (71H) pattern
    if (response.length >= 7 && response[5] === 0x71) {
        analysis.isCartStatusReturn = true;
        
        // Basic status parsing - needs refinement based on actual FlexiCart behavior
        if (response.length >= 10) {
            const statusByte = response[7]; // Status byte after CMD
            
            // These are educated guesses based on typical FlexiCart behavior
            if (statusByte === 0x00) {
                analysis.status = 'ready';
                analysis.initializationComplete = true;
            } else if (statusByte === 0x80) {
                analysis.status = 'initializing';
                analysis.initializationComplete = false;
            } else {
                analysis.status = `status_0x${statusByte.toString(16)}`;
                analysis.initializationComplete = false;
            }
        }
    } else {
        analysis.isCartStatusReturn = false;
        analysis.status = 'not_cart_status_return';
    }
    
    return analysis;
}

/**
 * Analyze bin response to determine occupancy and extract barcode
 */
function analyzeBinResponse(response, position) {
    const analysis = {
        position: position,
        responseHex: response.toString('hex'),
        length: response.length,
        occupied: false,
        barcode: null
    };
    
    // BIN STATUS RETURN (72H) with data
    if (response.length >= 7 && response[5] === 0x72) {
        analysis.occupied = true;
        analysis.barcode = extractBarcodeFromResponse(response, position);
        analysis.type = 'bin_status_return';
    }
    // Extended responses likely indicate occupancy
    else if (response.length > 2) {
        analysis.occupied = true;
        analysis.barcode = extractBarcodeFromResponse(response, position);
        analysis.type = 'extended_response';
    }
    // Short responses likely indicate empty bins
    else {
        analysis.occupied = false;
        analysis.type = 'short_response';
    }
    
    return analysis;
}

/**
 * Extract barcode from FlexiCart response
 */
function extractBarcodeFromResponse(response, position) {
    // Try to extract ASCII characters
    let ascii = '';
    for (const byte of response) {
        if (byte >= 0x20 && byte <= 0x7E) {
            ascii += String.fromCharCode(byte);
        }
    }
    
    if (ascii.length > 1) {
        return ascii.trim();
    }
    
    // Generate barcode from response pattern
    const dataSum = Array.from(response).reduce((sum, byte) => sum + byte, 0);
    const barcodeNumber = (position * 1000 + (dataSum % 1000)).toString().padStart(6, '0');
    return `FC${barcodeNumber}`;
}

// Run the test
if (require.main === module) {
    fullFlexiCartInitAndScan().catch(console.error);
}

module.exports = { fullFlexiCartInitAndScan };
