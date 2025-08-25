/**
 * FlexiCart Real Barcode Reading Test
 * Tests actual FlexiCart integrated barcode scanner using SENSE BIN STATUS commands
 * Runs on Linux system (/dev/ttyRP0)
 */

const { FlexiCartStateManager } = require('../src/commands/flexicart_data_structures');

async function testRealBarcodeReading() {
    console.log('🚀 FlexiCart Real Barcode Reading Test');
    console.log('=====================================\n');
    
    // Initialize with 30-bin configuration for testing
    const stateManager = new FlexiCartStateManager('FC01', 30);
    
    // Set the serial port for Linux system
    stateManager.barcodeIntegration.setSerialPort('/dev/ttyRP0');
    
    console.log('📡 Using FlexiCart integrated barcode scanner on /dev/ttyRP0');
    console.log('🔧 Configuration: 30-bin system, cart address 0x01\n');
    
    try {
        // Test 1: Scan a few specific positions
        console.log('🧪 Test 1: Scanning specific positions (5, 12, 18)');
        console.log('==================================================');
        
        const testPositions = [5, 12, 18];
        const specificResults = await stateManager.barcodeIntegration.scanPositions(testPositions);
        
        console.log('\n📋 Specific Position Results:');
        specificResults.forEach(result => {
            if (result.success) {
                if (result.binOccupied) {
                    console.log(`✅ Position ${result.position}: ${result.barcode} (occupied)`);
                    console.log(`   Cassette: ${result.cassette.title || 'Unknown Title'}`);
                    console.log(`   Category: ${result.cassette.category || 'Unknown'}`);
                    console.log(`   Format: ${result.cassette.format}`);
                } else {
                    console.log(`📭 Position ${result.position}: Empty bin`);
                }
            } else {
                console.log(`❌ Position ${result.position}: ${result.error}`);
            }
        });
        
        // Test 2: Show current inventory after specific scans
        console.log('\n📊 Current Inventory After Specific Scans:');
        console.log('==========================================');
        showInventoryStatus(stateManager);
        
        // Test 3: Perform full inventory scan (first 10 positions for demo)
        console.log('\n🧪 Test 2: Full inventory scan (positions 1-10)');
        console.log('===============================================');
        
        const fullScanResult = await stateManager.barcodeIntegration.performFullInventoryScan(10);
        
        console.log('\n📋 Full Scan Results:');
        console.log(`   Positions scanned: ${fullScanResult.summary.totalScanned}`);
        console.log(`   Successful reads: ${fullScanResult.summary.successfulReads}`);
        console.log(`   Occupied bins: ${fullScanResult.summary.occupiedBins}`);
        console.log(`   Barcodes found: ${fullScanResult.summary.binsWithBarcodes}`);
        console.log(`   Inventory updated: ${fullScanResult.inventoryUpdated} cassettes`);
        
        if (fullScanResult.occupiedPositions.length > 0) {
            console.log(`   Occupied positions: ${fullScanResult.occupiedPositions.join(', ')}`);
        }
        
        // Test 3: Show enhanced inventory with barcode information
        console.log('\n📈 Enhanced Inventory with Real Barcode Data:');
        console.log('=============================================');
        const enhancedInventory = stateManager.getInventoryWithBarcodes();
        
        console.log(`📊 Summary:`);
        console.log(`   Total Occupied: ${enhancedInventory.summary.totalOccupied}`);
        console.log(`   Valid Barcodes: ${enhancedInventory.summary.withValidBarcodes}`);
        console.log(`   Needs Scanning: ${enhancedInventory.summary.needsScanning}`);
        console.log(`   Auto-Scan: ${enhancedInventory.summary.autoScanEnabled ? 'Enabled' : 'Disabled'}\n`);
        
        if (enhancedInventory.bins.length > 0) {
            enhancedInventory.bins.forEach(bin => {
                const cassette = bin.cassette;
                const barcodeInfo = bin.barcodeStatus === 'valid' ? 
                    `✅ ${cassette.barcode}` : 
                    `⚠️  ${bin.barcodeStatus}`;
                    
                console.log(`📍 Bin ${bin.binNumber}: ${cassette.title || cassette.id} (${cassette.category || 'unknown'})`);
                console.log(`   ID: ${cassette.id}`);
                console.log(`   Barcode: ${barcodeInfo}`);
                console.log(`   Format: ${cassette.format || 'unknown'}`);
                console.log(`   Last Read: ${cassette.lastBarcodeRead || 'never'}`);
                console.log('');
            });
        } else {
            console.log('   No occupied bins found');
        }
        
        // Test 4: Show barcode reading statistics
        console.log('📊 Barcode Reading Statistics:');
        console.log('==============================');
        const barcodeStats = stateManager.getBarcodeStats();
        console.log(`Reader Database: ${barcodeStats.reader.totalBarcodes} codes, ${barcodeStats.reader.totalScans} scans`);
        console.log(`Inventory: ${barcodeStats.inventory.occupiedBins} occupied bins`);
        console.log(`Issues: ${barcodeStats.issues.total} total issues`);
        if (barcodeStats.issues.by_type && Object.keys(barcodeStats.issues.by_type).length > 0) {
            Object.entries(barcodeStats.issues.by_type).forEach(([type, count]) => {
                console.log(`   ${type}: ${count}`);
            });
        }
        
        // Test 5: Show scan history from the barcode reader
        console.log('\n📚 Recent Barcode Scan History:');
        console.log('===============================');
        const scanHistory = stateManager.barcodeIntegration.barcodeReader.getScanHistory(10);
        if (scanHistory.length > 0) {
            scanHistory.forEach((scan, index) => {
                const result = scan.result;
                const status = result.success ? 
                    (result.binOccupied ? `✅ ${result.barcode}` : '📭 Empty') : 
                    `❌ ${result.error}`;
                console.log(`${index + 1}. Position ${result.position}: ${status}`);
                console.log(`   Time: ${result.timestamp}`);
                if (scan.rawResponse) {
                    console.log(`   Raw: ${scan.rawResponse}`);
                }
            });
        } else {
            console.log('   No scan history available');
        }
        
        // Show any barcode issues that need attention
        const issues = stateManager.getCassettesWithBarcodeIssues();
        if (issues.length > 0) {
            console.log('\n⚠️  Cassettes with Barcode Issues:');
            console.log('===================================');
            issues.forEach(issue => {
                console.log(`Position ${issue.binNumber}: ${issue.issue} - ${issue.cassette.id}`);
            });
        } else if (enhancedInventory.bins.length > 0) {
            console.log('\n✅ All occupied cassettes have valid barcodes!');
        }
        
        console.log('\n🎉 Real FlexiCart barcode reading test completed!');
        console.log('✅ Using actual FlexiCart integrated barcode scanner');
        console.log('📡 SENSE BIN STATUS (0x01, 0x62) commands sent to /dev/ttyRP0');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        // Cleanup
        stateManager.destroy();
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
                    
            console.log(`   Bin ${bin.binNumber}: ${cassette.id}${barcodeDisplay} - ${cassette.title || 'Unknown'} (${cassette.category || 'unknown'})`);
        });
    } else {
        console.log('📍 No occupied bins found');
    }
}

// Run the test
if (require.main === module) {
    testRealBarcodeReading().catch(console.error);
}

module.exports = { testRealBarcodeReading };
