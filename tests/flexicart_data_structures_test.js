/**
 * FlexiCart Data Structures Test - 30 Bin Configuration
 * Demonstrates usage of the comprehensive FlexiCart data structures
 * Configured for 30-bin FlexiCart with 2 inserted cassettes
 */

const {
    FlexiCartSystemStatus,
    FlexiCartOperations,
    CassetteBinOccupancy,
    FlexiCartStateManager
} = require('../src/commands/flexicart_data_structures');

/**
 * Test FlexiCart data structures with 30-bin configuration
 */
async function testFlexiCartDataStructures() {
    console.log('\n🏗️  FLEXICART DATA STRUCTURES TEST (30-BIN CONFIG)');
    console.log('====================================================');
    
    // Test 1: System Status
    console.log('\n📊 Testing System Status...');
    const systemStatus = new FlexiCartSystemStatus('FC01', 30);
    
    // Simulate status update
    systemStatus.updateFromResponse({
        communication: { connected: true, lastResponseTime: new Date().toISOString() },
        hardware: { powerOn: true, initialized: true },
        movement: { 
            elevator: { position: 5, moving: false },
            carousel: { position: 45, moving: false },
            currentBin: 15
        }
    });
    
    console.log('✅ System Status:');
    console.log(`   Cart ID: ${systemStatus.cartId}`);
    console.log(`   Operational State: ${systemStatus.getOperationalState()}`);
    console.log(`   Ready: ${systemStatus.isReady()}`);
    console.log(`   Current Bin: ${systemStatus.movement.currentBin}`);
    console.log(`   Connected: ${systemStatus.communication.connected}`);
    
    // Test 2: Operations Tracking
    console.log('\n⚙️  Testing Operations Tracking...');
    const operations = new FlexiCartOperations();
    
    // Start some operations
    const moveOp = operations.startOperation('move', { 
        fromBin: 15, 
        toBin: 25,
        timeoutMs: 10000 
    });
    console.log(`✅ Started move operation: ${moveOp}`);
    
    // Add operation steps
    operations.addOperationStep(moveOp, {
        step: 'carousel_rotation',
        description: 'Rotating carousel to target position',
        progress: 25
    });
    
    operations.addOperationStep(moveOp, {
        step: 'elevator_movement', 
        description: 'Moving elevator to target level',
        progress: 75
    });
    
    // Update operation progress
    operations.updateOperation(moveOp, { 
        status: 'completed',
        progress: 100,
        result: { finalBin: 25, success: true }
    });
    
    console.log('✅ Operation completed:');
    const completedOp = operations.getOperation(moveOp);
    console.log(`   Type: ${completedOp.type}`);
    console.log(`   Status: ${completedOp.status}`);
    console.log(`   Duration: ${completedOp.duration}ms`);
    console.log(`   Steps: ${completedOp.steps.length}`);
    
    // Test 3: Cassette Bin Occupancy (30 bins, 2 cassettes)
    console.log('\n📼 Testing Cassette Bin Occupancy (30 bins, 2 cassettes)...');
    const inventory = new CassetteBinOccupancy(30);
    
    // Add exactly 2 cassettes as requested
    const testCassettes = [
        {
            bin: 5,
            cassette: {
                id: 'CART005',
                type: 'A',
                title: 'Morning Show Theme',
                artist: 'Studio Productions',
                duration: '00:03:45',
                category: 'jingle'
            }
        },
        {
            bin: 15,
            cassette: {
                id: 'CART015', 
                type: 'B',
                title: 'Weather Report Music',
                artist: 'Background Music Inc',
                duration: '00:02:30',
                category: 'background'
            }
        }
    ];
    
    // Load cassettes into inventory
    testCassettes.forEach(({ bin, cassette }) => {
        inventory.setCassette(bin, cassette);
    });
    
    const stats = inventory.getOccupancyStats();
    console.log('✅ Inventory loaded:');
    console.log(`   Total bins: ${stats.totalBins}`);
    console.log(`   Occupied: ${stats.occupied}`);
    console.log(`   Empty: ${stats.empty}`);
    console.log(`   Occupancy rate: ${stats.occupancyRate.toFixed(1)}%`);
    
    // Search functionality
    const jingles = inventory.searchCassettes({ category: 'jingle' });
    console.log(`   Jingles found: ${jingles.length}`);
    
    const cartById = inventory.findCassetteById('CART015');
    console.log(`   CART015 location: Bin ${cartById ? cartById.binNumber : 'not found'}`);
    
    // Show occupied bins with cassette IDs
    const occupiedBins = inventory.getOccupiedBins();
    console.log(`\n📦 Occupied bins with cassette IDs:`);
    occupiedBins.forEach(bin => {
        console.log(`   Bin ${bin.binNumber}: ${bin.cassette.id} - "${bin.cassette.title}"`);
    });
    
    // Show all bins status (visual representation with cassette IDs)
    console.log(`\n🗂️  Complete Bin Status Overview (${inventory.maxBins} bins):`);
    let binDisplay = '   ';
    for (let i = 1; i <= inventory.maxBins; i++) {
        const isOccupied = inventory.isBinOccupied(i);
        if (isOccupied) {
            const cassette = inventory.getCassette(i);
            binDisplay += `[${cassette.id}]`.padEnd(12);
        } else {
            binDisplay += `[Bin-${i.toString().padStart(2, '0')}]`.padEnd(12);
        }
        
        // Line break every 6 bins for readability
        if (i % 6 === 0) {
            console.log(binDisplay);
            binDisplay = '   ';
        }
    }
    if (binDisplay.trim() !== '') {
        console.log(binDisplay);
    }
    
    // Test 4: Complete State Manager
    console.log('\n🎛️  Testing Complete State Manager...');
    const stateManager = new FlexiCartStateManager('FC01', 30);
    
    // Set up event handlers
    stateManager.on('statusUpdate', (status) => {
        console.log(`📡 Status update received - State: ${status.getOperationalState()}`);
    });
    
    stateManager.on('inventoryUpdate', (stats) => {
        console.log(`📦 Inventory update - ${stats.occupied} cassettes loaded`);
    });
    
    stateManager.on('operationComplete', (operationId) => {
        console.log(`✅ Operation ${operationId} completed`);
    });
    
    // Simulate FlexiCart responses
    console.log('📡 Simulating FlexiCart responses...');
    
    // Status response simulation
    stateManager.updateFromResponse('status', {
        communication: { 
            connected: true, 
            lastResponseTime: new Date().toISOString(),
            responseTimeMs: 150
        },
        hardware: { 
            powerOn: true, 
            initialized: true,
            calibrated: true
        },
        movement: {
            elevator: { position: 3, moving: false, direction: 'stopped' },
            carousel: { position: 180, moving: false, direction: 'stopped' },
            currentBin: 18
        }
    });
    
    // Inventory response simulation with 2 cassettes
    stateManager.updateFromResponse('inventory', {
        bins: [
            { binNumber: 5, occupied: true, cassette: { id: 'CART005', title: 'Morning Theme' }},
            { binNumber: 15, occupied: true, cassette: { id: 'CART015', title: 'Weather Music' }}
        ]
    });
    
    // Operation completion simulation
    const testOpId = stateManager.operations.startOperation('load', { binNumber: 15 });
    stateManager.updateFromResponse('operation_complete', {
        operationId: testOpId,
        result: { success: true, cartLoaded: true }
    });
    
    // Get complete system state
    const fullState = stateManager.getState();
    console.log('\n📋 Complete System State:');
    console.log(`   System ready: ${fullState.system.isReady()}`);
    console.log(`   Active operations: ${fullState.operations.active.length}`);
    console.log(`   Total operations: ${fullState.operations.total}`);
    console.log(`   Inventory occupancy: ${fullState.inventory.occupancyRate.toFixed(1)}%`);
    
    // Test inventory export/import
    console.log('\n💾 Testing Inventory Export/Import...');
    const exportedInventory = stateManager.inventory.exportInventory();
    console.log('✅ Inventory exported:');
    console.log(`   Bins exported: ${exportedInventory.bins.length}`);
    console.log(`   Metadata version: ${exportedInventory.metadata.version}`);
    
    // Create new inventory and import
    const newInventory = new CassetteBinOccupancy(30);
    newInventory.importInventory(exportedInventory);
    console.log(`✅ Inventory imported - ${newInventory.getOccupancyStats().occupied} cassettes`);
    
    // Show imported inventory with IDs
    console.log('\n📋 Imported Inventory Layout:');
    const importedOccupied = newInventory.getOccupiedBins();
    importedOccupied.forEach(bin => {
        console.log(`   Bin ${bin.binNumber}: ${bin.cassette.id} - "${bin.cassette.title}"`);
    });
    
    // Cleanup
    stateManager.destroy();
    
    console.log('\n🎉 All data structure tests completed successfully!');
    console.log(`📊 Final Summary: 30-bin FlexiCart with ${testCassettes.length} cassettes loaded`);
    
    return {
        systemStatus,
        operations,
        inventory,
        stateManager: null // Destroyed for cleanup
    };
}

// Example usage patterns for 30-bin configuration
function demonstrateUsagePatterns() {
    console.log('\n📚 USAGE PATTERNS (30-BIN FLEXICART)');
    console.log('=====================================');
    
    console.log(`
🔍 1. MONITORING SYSTEM STATUS (30-bin FlexiCart):
   const status = new FlexiCartSystemStatus('FC01', 30);
   // Update from FlexiCart response
   status.updateFromResponse(parsedResponse);
   
   // Check readiness
   if (status.isReady()) {
       console.log('FlexiCart ready for operations');
   }
   
   // Get operational state
   const state = status.getOperationalState(); // 'READY', 'MOVING', 'ON_AIR', etc.

⚙️ 2. TRACKING OPERATIONS:
   const ops = new FlexiCartOperations();
   
   // Start operation (bin range 1-30)
   const opId = ops.startOperation('move', { fromBin: 5, toBin: 15 });
   
   // Add progress updates
   ops.addOperationStep(opId, { 
       step: 'carousel_rotation',
       progress: 50 
   });
   
   // Complete operation
   ops.updateOperation(opId, { 
       status: 'completed',
       result: { success: true }
   });

📦 3. MANAGING INVENTORY (30 bins with ID display):
   const inventory = new CassetteBinOccupancy(30);
   
   // Add cassette with ID display
   inventory.setCassette(5, {
       id: 'CART005',
       title: 'Morning Show Theme',
       type: 'A',
       duration: '00:03:30'
   });
   
   // Visual display shows: Bin 5: CART005 - "Morning Show Theme"
   
   // Search cassettes
   const jingles = inventory.searchCassettes({ category: 'jingle' });
   
   // Check occupancy (shows cassette IDs in occupied bins)
   const occupied = inventory.getOccupiedBins();
   occupied.forEach(bin => {
       console.log(\`Bin \${bin.binNumber}: \${bin.cassette.id}\`);
   });

🎛️ 4. COMPLETE STATE MANAGEMENT:
   const stateManager = new FlexiCartStateManager('FC01', 30);
   
   // Event handling with bin status
   stateManager.on('statusUpdate', (status) => {
       console.log(\`Current bin: \${status.movement.currentBin}/30\`);
   });
   
   // Update from FlexiCart
   stateManager.updateFromResponse('status', responseData);
   
   // Get complete state
   const fullState = stateManager.getState();
    `);
}

// Run tests if called directly
if (require.main === module) {
    testFlexiCartDataStructures()
        .then(() => {
            demonstrateUsagePatterns();
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Test failed:', error.message);
            process.exit(1);
        });
}

module.exports = {
    testFlexiCartDataStructures,
    demonstrateUsagePatterns
};
