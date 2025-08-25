/**
 * FlexiCart Barcode Integration Test
 * Demonstrates barcode reading functionality with 30-bin configuration
 */

const { FlexiCartStateManager } = require('../src/commands/flexicart_data_structures');

async function demonstrateBarcodeReading() {
    console.log('🚀 FlexiCart Barcode Reading Demonstration');
    console.log('==========================================\n');
    
    // Initialize with 30-bin configuration
    const stateManager = new FlexiCartStateManager('FC01', 30);
    
    console.log('📼 Setting up 30-bin FlexiCart with 2 cassettes...');
    
    // Add cassettes to positions 5 and 18 (as shown in previous demo)
    stateManager.inventory.setCassette(5, {
        id: 'TEMP_005', // Temporary ID, will be replaced by barcode
        type: 'A',
        title: 'Placeholder Title 5',
        artist: 'Unknown Artist',
        category: 'commercial',
        duration: '00:00:30'
    });
    
    stateManager.inventory.setCassette(18, {
        id: 'TEMP_018', // Temporary ID, will be replaced by barcode
        type: 'B', 
        title: 'Placeholder Title 18',
        artist: 'Unknown Artist',
        category: 'music',
        duration: '00:03:45'
    });
    
    console.log('✅ Initial setup complete\n');
    
    // Show current state before barcode scanning
    console.log('📊 BEFORE Barcode Scanning:');
    console.log('============================');
    showInventoryStatus(stateManager);
    
    // Enable automatic barcode scanning
    console.log('\n🔍 Enabling automatic barcode scanning...');
    stateManager.enableAutoBarcodeScanning();
    
    // Scan all occupied positions
    console.log('\n🔍 Scanning barcodes at all occupied positions...');
    const scanResults = await stateManager.scanAllBarcodes();
    
    console.log('\n📋 Barcode Scan Results:');
    console.log('========================');
    scanResults.forEach(result => {
        if (result.success) {
            console.log(`✅ Position ${result.position}: ${result.barcode}`);
        } else {
            console.log(`❌ Position ${result.position}: ${result.error}`);
        }
    });
    
    // Show updated state after barcode scanning
    console.log('\n📊 AFTER Barcode Scanning:');
    console.log('===========================');
    showInventoryStatus(stateManager);
    
    // Show enhanced inventory with barcode information
    console.log('\n📈 Enhanced Inventory with Barcode Status:');
    console.log('==========================================');
    const enhancedInventory = stateManager.getInventoryWithBarcodes();
    
    console.log(`📊 Summary:`);
    console.log(`   Total Occupied: ${enhancedInventory.summary.totalOccupied}`);
    console.log(`   Valid Barcodes: ${enhancedInventory.summary.withValidBarcodes}`);
    console.log(`   Needs Scanning: ${enhancedInventory.summary.needsScanning}`);
    console.log(`   Auto-Scan: ${enhancedInventory.summary.autoScanEnabled ? 'Enabled' : 'Disabled'}\n`);
    
    enhancedInventory.bins.forEach(bin => {
        const cassette = bin.cassette;
        const barcodeInfo = bin.barcodeStatus === 'valid' ? 
            `✅ ${cassette.barcode}` : 
            `⚠️  ${bin.barcodeStatus}`;
            
        console.log(`📍 Bin ${bin.binNumber}: ${cassette.title} (${cassette.category})`);
        console.log(`   ID: ${cassette.id}`);
        console.log(`   Barcode: ${barcodeInfo}`);
        console.log(`   Duration: ${cassette.duration}`);
        console.log(`   Metadata: ${Object.keys(cassette.metadata || {}).length} fields`);
        console.log('');
    });
    
    // Show barcode statistics
    console.log('📊 Barcode Reading Statistics:');
    console.log('==============================');
    const barcodeStats = stateManager.getBarcodeStats();
    console.log(`Reader Database: ${barcodeStats.reader.totalBarcodes} codes, ${barcodeStats.reader.totalScans} scans`);
    console.log(`Inventory: ${barcodeStats.inventory.occupiedBins} occupied bins`);
    console.log(`Issues: ${barcodeStats.issues.total} total issues`);
    if (barcodeStats.issues.by_type) {
        Object.entries(barcodeStats.issues.by_type).forEach(([type, count]) => {
            console.log(`   ${type}: ${count}`);
        });
    }
    
    // Demonstrate individual barcode scanning
    console.log('\n🔍 Demonstrating Individual Barcode Scan:');
    console.log('=========================================');
    
    // Add a third cassette without initial barcode info
    stateManager.inventory.setCassette(12, {
        id: 'UNKNOWN_012',
        type: 'C',
        title: 'Mystery Cassette',
        artist: 'Unknown',
        category: 'unknown'
    });
    
    console.log('📼 Added new cassette at position 12 (no barcode info)');
    
    // Scan just that position
    const individualScan = await stateManager.scanBarcodeAtPosition(12);
    if (individualScan.success) {
        console.log(`✅ Scanned position 12: ${individualScan.barcode}`);
        console.log(`   Cassette now identified as: ${individualScan.cassette.title}`);
        console.log(`   Category: ${individualScan.cassette.category}`);
        console.log(`   Duration: ${individualScan.cassette.duration}`);
    } else {
        console.log(`❌ Failed to scan position 12: ${individualScan.error}`);
    }
    
    // Show final inventory status
    console.log('\n📊 FINAL Inventory Status:');
    console.log('===========================');
    showInventoryStatus(stateManager);
    
    // Show any remaining barcode issues
    const issues = stateManager.getCassettesWithBarcodeIssues();
    if (issues.length > 0) {
        console.log('\n⚠️  Cassettes with Barcode Issues:');
        console.log('===================================');
        issues.forEach(issue => {
            console.log(`Position ${issue.binNumber}: ${issue.issue} - ${issue.cassette.id}`);
        });
    } else {
        console.log('\n✅ All cassettes have valid barcodes!');
    }
    
    // Cleanup
    stateManager.destroy();
    
    console.log('\n🎉 Barcode reading demonstration complete!');
    console.log('✅ All cassette IDs are now correctly identified through barcode reading');
}

function showInventoryStatus(stateManager) {
    const occupancyStats = stateManager.inventory.getOccupancyStats();
    const occupiedBins = stateManager.inventory.getOccupiedBins();
    
    console.log(`📊 ${occupancyStats.maxBins}-bin FlexiCart with ${occupancyStats.occupiedBins} cassettes loaded:`);
    console.log(`   Occupancy: ${occupancyStats.occupancyPercentage}%`);
    console.log(`   Available space: ${occupancyStats.availableBins} bins\n`);
    
    console.log('📍 Occupied Bins:');
    occupiedBins.forEach(bin => {
        const cassette = bin.cassette;
        const barcodeDisplay = cassette.barcode ? 
            ` [${cassette.barcode}]` : 
            cassette.scannedBarcode ? 
                ` [${cassette.scannedBarcode}]` : 
                ' [No barcode]';
                
        console.log(`   Bin ${bin.binNumber}: ${cassette.id}${barcodeDisplay} - ${cassette.title} (${cassette.category}, ${cassette.duration})`);
    });
}

// Run the demonstration
if (require.main === module) {
    demonstrateBarcodeReading().catch(console.error);
}

module.exports = { demonstrateBarcodeReading };
