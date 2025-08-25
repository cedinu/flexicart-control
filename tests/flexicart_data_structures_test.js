/**
 * FlexiCart Data Structures Test
 * Demonstrates usage of the comprehensive FlexiCart data structures
 */

const {
    FlexiCartSystemStatus,
    FlexiCartOperations,
    CassetteBinOccupancy,
    FlexiCartStateManager
} = require('../src/commands/flexicart_data_structures');

/**
 * Test FlexiCart data structures
 */
async function testFlexiCartDataStructures() {
    console.log('\n🏗️  FLEXICART DATA STRUCTURES TEST');
    console.log('=====================================');
    
    // Test 1: System Status
    console.log('\n📊 Testing System Status...');
    const systemStatus = new FlexiCartSystemStatus('FC01', 360);
    
    // Simulate status update
    systemStatus.updateFromResponse({
        communication: { connected: true, lastResponseTime: new Date().toISOString() },
        hardware: { powerOn: true, initialized: true },
        movement: { 
            elevator: { position: 5, moving: false },
            carousel: { position: 45, moving: false },
            currentBin: 45
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
        fromBin: 45, 
        toBin: 120,
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
        result: { finalBin: 120, success: true }
    });
    
    console.log('✅ Operation completed:');
    const completedOp = operations.getOperation(moveOp);
    console.log(`   Type: ${completedOp.type}`);
    console.log(`   Status: ${completedOp.status}`);
    console.log(`   Duration: ${completedOp.duration}ms`);
    console.log(`   Steps: ${completedOp.steps.length}`);
    
    // Test 3: Cassette Bin Occupancy
    console.log('\n📼 Testing Cassette Bin Occupancy...');
    const inventory = new CassetteBinOccupancy(360);
    
    // Add some cassettes
    const testCassettes = [
        {
            bin: 1,
            cassette: {
                id: 'CART001',
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
        },
        {
            bin: 120,
            cassette: {
                id: 'CART120',
                type: 'C',
                title: 'Commercial Break 1',
                artist: 'Local Advertiser',
                duration: '00:01:00',
                category: 'commercial'
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
    
    // Test 4: Complete State Manager
    console.log('\n🎛️  Testing Complete State Manager...');
    const stateManager = new FlexiCartStateManager('FC01', 360);
    
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
            elevator: { position: 8, moving: false, direction: 'stopped' },
            carousel: { position: 180, moving: false, direction: 'stopped' },
            currentBin: 180
        }
    });
    
    // Inventory response simulation
    stateManager.updateFromResponse('inventory', {
        bins: [
            { binNumber: 1, occupied: true, cassette: { id: 'CART001', title: 'News Theme' }},
            { binNumber: 25, occupied: true, cassette: { id: 'CART025', title: 'Sports Intro' }},
            { binNumber: 100, occupied: false }
        ]
    });
    
    // Operation completion simulation
    const testOpId = stateManager.operations.startOperation('load', { binNumber: 25 });
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
    const newInventory = new CassetteBinOccupancy(360);
    newInventory.importInventory(exportedInventory);
    console.log(`✅ Inventory imported - ${newInventory.getOccupancyStats().occupied} cassettes`);
    
    // Cleanup
    stateManager.destroy();
    
    console.log('\n🎉 All data structure tests completed successfully!');
    
    return {
        systemStatus,
        operations,
        inventory,
        stateManager: null // Destroyed for cleanup
    };
}

// Example usage patterns
function demonstrateUsagePatterns() {
    console.log('\n📚 USAGE PATTERNS');
    console.log('==================');
    
    console.log(`
🔍 1. MONITORING SYSTEM STATUS:
   const status = new FlexiCartSystemStatus('FC01');
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
   
   // Start operation
   const opId = ops.startOperation('move', { fromBin: 10, toBin: 50 });
   
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

📦 3. MANAGING INVENTORY:
   const inventory = new CassetteBinOccupancy(360);
   
   // Add cassette
   inventory.setCassette(25, {
       id: 'CART025',
       title: 'Morning Show Theme',
       type: 'A',
       duration: '00:03:30'
   });
   
   // Search cassettes
   const jingles = inventory.searchCassettes({ category: 'jingle' });
   
   // Check occupancy
   const stats = inventory.getOccupancyStats();
   console.log('Occupancy:', stats.occupancyRate + '%');

🎛️ 4. COMPLETE STATE MANAGEMENT:
   const stateManager = new FlexiCartStateManager('FC01');
   
   // Event handling
   stateManager.on('statusUpdate', (status) => {
       updateUI(status);
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
