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
        // Enable automatic barcode scanning first
        console.log('� Enabling automatic barcode scanning...');
        stateManager.enableAutoBarcodeScanning();
        
        // Test 1: Perform full inventory scan of positions 1-30
        console.log('\n🧪 Test 1: Full inventory scan (positions 1-30)');
        console.log('===============================================');
        
        const fullScanResult = await stateManager.barcodeIntegration.performFullInventoryScan(30);
        
        console.log('\n📋 Full Scan Results:');
        console.log(`   Positions scanned: ${fullScanResult.summary.totalScanned}`);
        console.log(`   Successful reads: ${fullScanResult.summary.successfulReads}`);
        console.log(`   Occupied bins: ${fullScanResult.summary.occupiedBins}`);
        console.log(`   Barcodes found: ${fullScanResult.summary.binsWithBarcodes}`);
        console.log(`   Inventory updated: ${fullScanResult.inventoryUpdated} cassettes`);
        console.log(`   Bin lamps set: ${fullScanResult.detectedPositions?.length || 0} positions`);
        
        if (fullScanResult.occupiedPositions && fullScanResult.occupiedPositions.length > 0) {
            console.log(`   Occupied positions: ${fullScanResult.occupiedPositions.join(', ')}`);
        }
        
        if (fullScanResult.detectedPositions && fullScanResult.detectedPositions.length > 0) {
            console.log(`   💡 Lamps activated at: ${fullScanResult.detectedPositions.join(', ')}`);
        }
        
        // Test 2: Show current inventory after full scan
        console.log('\n📊 Current Inventory After Full Scan:');
        console.log('=====================================');
        showInventoryStatus(stateManager);
        
        // Test 3: Show enhanced inventory with barcode information
        console.log('\n📈 Enhanced Inventory with Real Barcode Data:');
        console.log('=============================================');
        const enhancedInventory = stateManager.getInventoryWithBarcodes();
        
        console.log(`📊 Summary:`);
        console.log(`   Total Occupied: ${enhancedInventory.summary.totalOccupied}`);
        console.log(`   Valid Barcodes: ${enhancedInventory.summary.withValidBarcodes}`);
        console.log(`   Needs Scanning: ${enhancedInventory.summary.needsScanning}`);
        console.log(`   Auto-Scan: ${enhancedInventory.summary.autoScanEnabled ? 'Enabled ✅' : 'Disabled'}\n`);
        
        if (enhancedInventory.bins.length > 0) {
            console.log('📍 Detected Cassettes:');
            enhancedInventory.bins.forEach(bin => {
                const cassette = bin.cassette;
                const barcodeInfo = bin.barcodeStatus === 'valid' ? 
                    `✅ ${cassette.barcode || 'N/A'}` : 
                    `⚠️  ${bin.barcodeStatus}`;
                    
                console.log(`� Bin ${bin.binNumber}: ${cassette.title || cassette.id} (${cassette.category || 'unknown'})`);
                console.log(`   ID: ${cassette.id}`);
                console.log(`   Barcode: ${barcodeInfo}`);
                console.log(`   Format: ${cassette.format || 'unknown'}`);
                console.log(`   Last Read: ${cassette.lastBarcodeRead || 'never'}`);
                console.log(`   Raw Data: ${cassette.rawScanData || 'none'}`);
                console.log('');
            });
        } else {
            console.log('   No occupied bins found - all positions appear empty');
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
        console.log('💡 SET BIN LAMP (0x01, 0x09) commands for detected cassettes');
        console.log('🔄 Auto-scan enabled for continuous monitoring');
        console.log(`\n📊 Final Stats:`);
        console.log(`   Positions scanned: 1-30`);
        console.log(`   Cassettes detected: ${enhancedInventory.summary.totalOccupied}`);
        console.log(`   Bin lamps activated: ${fullScanResult.detectedPositions?.length || 0}`);
        console.log(`   Auto-scan: ${enhancedInventory.summary.autoScanEnabled ? 'Active' : 'Inactive'}`);
        
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
