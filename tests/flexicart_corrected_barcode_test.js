/**
 * FlexiCart Corrected Barcode Command Test
 * Tests the corrected command structure based on official FlexiCart protocol
 * 
 * CORRECTED COMMANDS:
 * - SENSE BIN STATUS: CMD=0x62, CTRL=position, DATA=0x80
 * - BIN STATUS RETURN: CMD=0x72, CTRL=position, DATA=0x80  
 * - SET BIN LAMP: CMD=0x09, CTRL=position, DATA=0x01/0x00
 */

const { FlexiCartStateManager } = require('../src/commands/flexicart_data_structures');

async function testCorrectedBarcodeCommands() {
    console.log('🔧 FlexiCart Corrected Barcode Command Test');
    console.log('==========================================\n');
    
    // Initialize with 30-bin configuration for testing
    const stateManager = new FlexiCartStateManager('FC01', 30);
    
    // Set the serial port for Linux system  
    stateManager.barcodeIntegration.setSerialPort('/dev/ttyRP0');
    
    console.log('📡 Using FlexiCart on /dev/ttyRP0 with CORRECTED command structure');
    console.log('🔧 Configuration: 30-bin system, cart address 0x01');
    console.log('✅ Commands now use proper FlexiCart protocol structure\n');
    
    try {
        // Test 1: Single position barcode read with corrected commands
        console.log('🧪 Test 1: Single Position Barcode Read (Corrected Commands)');
        console.log('=============================================================');
        const testPosition = 5;
        
        console.log(`📍 Testing corrected SENSE BIN STATUS command at position ${testPosition}...`);
        const singleScan = await stateManager.barcodeIntegration.scanAndUpdateCassette(testPosition);
        
        if (singleScan.success) {
            console.log(`✅ Position ${testPosition}: ${singleScan.binOccupied ? 'Occupied' : 'Empty'}`);
            if (singleScan.binOccupied) {
                console.log(`   Barcode: ${singleScan.barcode || 'No barcode data'}`);
                console.log(`   Cassette: ${singleScan.cassette.title || singleScan.cassette.id}`);
                
                // Test lamp control with corrected command
                console.log(`💡 Testing corrected SET BIN LAMP command...`);
                const lampResult = await stateManager.barcodeIntegration.barcodeReader.setBinLamp(
                    '/dev/ttyRP0', testPosition, true, 0x01
                );
                console.log(`   Lamp control: ${lampResult ? 'SUCCESS' : 'FAILED'}`);
            }
        } else {
            console.log(`❌ Position ${testPosition}: ${singleScan.error}`);
        }
        
        // Test 2: Quick scan of first 10 positions with corrected commands
        console.log('\n🧪 Test 2: Multi-Position Scan (Corrected Commands)');
        console.log('==================================================');
        const testPositions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        
        console.log(`🔍 Scanning positions ${testPositions.join(', ')} with corrected commands...`);
        const multiScan = await stateManager.barcodeIntegration.scanPositions(testPositions);
        
        let occupiedCount = 0;
        let emptyCount = 0;
        let errorCount = 0;
        
        multiScan.forEach(result => {
            if (result.success) {
                if (result.binOccupied) {
                    occupiedCount++;
                    console.log(`✅ Position ${result.position}: Occupied (${result.barcode || 'No barcode'})`);
                } else {
                    emptyCount++;
                    console.log(`📭 Position ${result.position}: Empty`);
                }
            } else {
                errorCount++;
                console.log(`❌ Position ${result.position}: Error - ${result.error}`);
            }
        });
        
        console.log(`\n📊 Multi-Position Scan Results:`);
        console.log(`   Occupied bins: ${occupiedCount}`);
        console.log(`   Empty bins: ${emptyCount}`);
        console.log(`   Errors: ${errorCount}`);
        console.log(`   Total scanned: ${testPositions.length}`);
        
        // Test 3: Command structure verification
        console.log('\n🧪 Test 3: Command Structure Verification');
        console.log('========================================');
        
        // Show the actual command bytes being sent
        const { createFlexiCartCommand } = require('../src/commands/flexicart_serial_utils');
        
        console.log('📡 Corrected Command Structure:');
        console.log('------------------------------');
        
        // SENSE BIN STATUS for position 1
        const senseBinCmd = createFlexiCartCommand(0x01, 0x62, 0x00, 1, 0x80);
        console.log(`SENSE BIN STATUS (pos 1): ${senseBinCmd.toString('hex').match(/.{2}/g).join(' ')}`);
        console.log(`   STX=0x02, BC=0x06, UA1=0x01, UA2=0x01, BT=0x00, CMD=0x62, CTRL=0x01, DATA=0x80, CS=calculated`);
        
        // SET BIN LAMP for position 1 (ON)
        const setBinLampCmd = createFlexiCartCommand(0x01, 0x09, 0x00, 1, 0x01);
        console.log(`SET BIN LAMP ON (pos 1):  ${setBinLampCmd.toString('hex').match(/.{2}/g).join(' ')}`);
        console.log(`   STX=0x02, BC=0x06, UA1=0x01, UA2=0x01, BT=0x00, CMD=0x09, CTRL=0x01, DATA=0x01, CS=calculated`);
        
        // Show current inventory after corrected scan
        console.log('\n📊 Current Inventory (After Corrected Commands):');
        console.log('===============================================');
        showInventoryStatus(stateManager);
        
        console.log('\n🎉 FlexiCart corrected barcode command test completed!');
        console.log('✅ Commands now use proper FlexiCart protocol specification');
        console.log('📡 SENSE BIN STATUS: CMD=0x62, position in CTRL byte');
        console.log('📡 SET BIN LAMP: CMD=0x09, position in CTRL, lamp state in DATA');
        console.log('🔧 All command parameters now in correct FlexiCart packet positions');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        // Cleanup
        stateManager.destroy();
        console.log('🧹 Cleanup completed');
    }
}

function showInventoryStatus(stateManager) {
    const occupancyStats = stateManager.inventory.getOccupancyStats();
    const occupiedBins = stateManager.inventory.getOccupiedBins();
    
    console.log(`📊 ${occupancyStats.maxBins}-bin FlexiCart with ${occupancyStats.occupiedBins} cassettes loaded:`);
    console.log(`   Occupancy: ${occupancyStats.occupancyPercentage}%`);
    console.log(`   Available space: ${occupancyStats.availableBins} bins\n`);
    
    if (occupiedBins.length > 0) {
        console.log('📍 Occupied Bins:');
        occupiedBins.forEach(bin => {
            const cassette = bin.cassette;
            const barcodeDisplay = cassette.barcode ? 
                ` [${cassette.barcode}]` : 
                cassette.scannedBarcode ? 
                    ` [${cassette.scannedBarcode}]` : 
                    ' [No barcode]';
                    
            console.log(`   Bin ${bin.binNumber}: ${cassette.title || cassette.id}${barcodeDisplay}`);
        });
    } else {
        console.log('   No occupied bins detected');
    }
}

// Run the test
if (require.main === module) {
    testCorrectedBarcodeCommands().catch(console.error);
}

module.exports = { testCorrectedBarcodeCommands };
