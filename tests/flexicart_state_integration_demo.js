/**
 * FlexiCart State Integration Example
 * Demonstrates complete usage of the FlexiCart state management system
 */

const { FlexiCartStateIntegration } = require('../src/commands/flexicart_state_integration');

/**
 * FlexiCart State Integration Demo
 */
async function flexiCartStateDemo() {
    console.log('\n🎯 FLEXICART STATE INTEGRATION DEMO');
    console.log('====================================');
    
    const flexicart = new FlexiCartStateIntegration('/dev/ttyRP0', 'FC01');
    
    try {
        // Setup event listeners for real-time monitoring
        console.log('\n📡 Setting up event listeners...');
        
        flexicart.on('statusUpdate', (status) => {
            console.log(`🔄 Status: ${status.getOperationalState()} | Position: ${status.movement.currentBin} | Ready: ${status.isReady()}`);
        });
        
        flexicart.on('inventoryUpdate', (stats) => {
            console.log(`📦 Inventory: ${stats.occupied}/${stats.totalBins} occupied (${stats.occupancyRate.toFixed(1)}%)`);
        });
        
        flexicart.on('operationComplete', (operationId) => {
            const operation = flexicart.stateManager.operations.getOperation(operationId);
            console.log(`✅ ${operation.type} completed in ${operation.duration}ms`);
        });
        
        // Connect to FlexiCart
        console.log('\n🔌 Connecting to FlexiCart...');
        await flexicart.connect();
        
        // Wait for initial status
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Demonstrate various operations
        console.log('\n🎛️  Performing FlexiCart operations...');
        
        // 1. Check initial status
        console.log('\n1️⃣ Querying initial status...');
        const initialStatus = await flexicart.queryStatus();
        console.log(`   Status result: ${initialStatus.success ? '✅ Success' : '❌ Failed'}`);
        
        // 2. Query position
        console.log('\n2️⃣ Querying position...');
        const positionResult = await flexicart.queryPosition();
        console.log(`   Position result: ${positionResult.success ? '✅ Success' : '❌ Failed'}`);
        
        // 3. Test ON-AIR tally
        console.log('\n3️⃣ Testing ON-AIR tally control...');
        const tallyOnResult = await flexicart.setOnAirTally(true);
        console.log(`   Tally ON: ${tallyOnResult.success ? '✅ Success' : '❌ Failed'}`);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const tallyOffResult = await flexicart.setOnAirTally(false);
        console.log(`   Tally OFF: ${tallyOffResult.success ? '✅ Success' : '❌ Failed'}`);
        
        // 4. Test movement commands (these return ACK and require monitoring)
        console.log('\n4️⃣ Testing movement commands...');
        
        const elevatorUpResult = await flexicart.moveElevatorUp();
        console.log(`   Elevator UP: ${elevatorUpResult.success ? '✅ Success' : '❌ Failed'}`);
        if (elevatorUpResult.operationId) {
            console.log(`   Operation ID: ${elevatorUpResult.operationId}`);
            
            // Wait for operation completion
            await new Promise(resolve => {
                const checkComplete = () => {
                    const operation = flexicart.stateManager.operations.getOperation(elevatorUpResult.operationId);
                    if (operation.status === 'completed' || operation.status === 'failed' || operation.status === 'timeout') {
                        resolve();
                    } else {
                        setTimeout(checkComplete, 100);
                    }
                };
                checkComplete();
            });
        }
        
        // 5. Query inventory
        console.log('\n5️⃣ Querying inventory...');
        const inventoryResult = await flexicart.queryInventory();
        console.log(`   Inventory result: ${inventoryResult.success ? '✅ Success' : '❌ Failed'}`);
        
        // 6. Display complete system state
        console.log('\n📋 COMPLETE SYSTEM STATE');
        console.log('=========================');
        
        const completeState = flexicart.getState();
        
        console.log('🖥️  System Status:');
        console.log(`   Cart ID: ${completeState.system.cartId}`);
        console.log(`   Operational State: ${completeState.system.getOperationalState()}`);
        console.log(`   Ready: ${completeState.system.isReady()}`);
        console.log(`   Connected: ${completeState.system.communication.connected}`);
        console.log(`   Current Bin: ${completeState.system.movement.currentBin}`);
        console.log(`   ON-AIR Tally: ${completeState.system.onAir.tallyOn}`);
        
        console.log('\n⚙️  Operations:');
        console.log(`   Active Operations: ${completeState.operations.active.length}`);
        console.log(`   Total Operations: ${completeState.operations.total}`);
        
        const activeOps = flexicart.getActiveOperations();
        if (activeOps.length > 0) {
            activeOps.forEach(op => {
                console.log(`   - ${op.type}: ${op.status} (${op.progress}%)`);
            });
        }
        
        console.log('\n📦 Inventory:');
        console.log(`   Total Bins: ${completeState.inventory.totalBins}`);
        console.log(`   Occupied: ${completeState.inventory.occupied}`);
        console.log(`   Empty: ${completeState.inventory.empty}`);
        console.log(`   Occupancy Rate: ${completeState.inventory.occupancyRate.toFixed(1)}%`);
        
        // 7. Demonstrate inventory management
        console.log('\n📚 INVENTORY MANAGEMENT DEMO');
        console.log('=============================');
        
        const inventory = flexicart.getInventory();
        
        // Add some demo cassettes
        console.log('📼 Adding demo cassettes...');
        
        const demoCassettes = [
            {
                bin: 1,
                cassette: {
                    id: 'DEMO001',
                    type: 'A',
                    title: 'Station ID Jingle',
                    artist: 'Production Team',
                    duration: '00:00:10',
                    category: 'jingle',
                    priority: 'high'
                }
            },
            {
                bin: 25,
                cassette: {
                    id: 'DEMO025',
                    type: 'B', 
                    title: 'News Theme Music',
                    artist: 'Audio Library',
                    duration: '00:01:30',
                    category: 'music',
                    priority: 'normal'
                }
            },
            {
                bin: 100,
                cassette: {
                    id: 'DEMO100',
                    type: 'C',
                    title: 'Commercial Break',
                    artist: 'Local Business',
                    duration: '00:00:30',
                    category: 'commercial',
                    priority: 'normal'
                }
            }
        ];
        
        demoCassettes.forEach(({ bin, cassette }) => {
            inventory.setCassette(bin, cassette);
            console.log(`   ✅ Added "${cassette.title}" to bin ${bin}`);
        });
        
        // Show updated inventory stats
        const updatedStats = inventory.getOccupancyStats();
        console.log(`\n📊 Updated inventory: ${updatedStats.occupied} cassettes loaded`);
        
        // Demonstrate search functionality
        console.log('\n🔍 Search functionality:');
        const jingles = inventory.searchCassettes({ category: 'jingle' });
        console.log(`   Jingles found: ${jingles.length}`);
        jingles.forEach(result => {
            console.log(`   - Bin ${result.binNumber}: ${result.cassette.title}`);
        });
        
        const commercials = inventory.searchCassettes({ category: 'commercial' });
        console.log(`   Commercials found: ${commercials.length}`);
        
        // Find specific cassette
        const demo025 = inventory.findCassetteById('DEMO025');
        console.log(`   DEMO025 location: ${demo025 ? `Bin ${demo025.binNumber}` : 'Not found'}`);
        
        // Show occupied bins
        const occupiedBins = inventory.getOccupiedBins();
        console.log(`\n📦 Occupied bins (${occupiedBins.length}):`);
        occupiedBins.forEach(bin => {
            console.log(`   Bin ${bin.binNumber}: ${bin.cassette.title} (${bin.cassette.duration})`);
        });
        
        // Export/Import demo
        console.log('\n💾 Export/Import demo:');
        const exportedData = inventory.exportInventory();
        console.log(`   Exported ${exportedData.bins.length} cassettes`);
        console.log(`   Export version: ${exportedData.metadata.version}`);
        
        console.log('\n✨ DEMO COMPLETED SUCCESSFULLY!');
        console.log('\nFlexiCart state management system is now fully operational with:');
        console.log('• Real-time status monitoring');
        console.log('• Operation tracking and progress monitoring');
        console.log('• Complete inventory management');
        console.log('• Event-driven state updates');
        console.log('• Comprehensive error handling');
        
    } catch (error) {
        console.error('\n❌ Demo failed:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        // Cleanup
        console.log('\n🧹 Cleaning up...');
        await flexicart.destroy();
        console.log('✅ Cleanup completed');
    }
}

/**
 * Web API Integration Example
 * Shows how to integrate with HTTP/WebSocket API
 */
function webApiIntegrationExample() {
    console.log('\n🌐 WEB API INTEGRATION EXAMPLE');
    console.log('===============================');
    
    console.log(`
// Express.js API endpoints example:

const express = require('express');
const { FlexiCartStateIntegration } = require('./flexicart_state_integration');

const app = express();
const flexicart = new FlexiCartStateIntegration('/dev/ttyRP0');

// Initialize FlexiCart connection
app.listen(3000, async () => {
    await flexicart.connect();
    console.log('FlexiCart API ready on port 3000');
});

// GET /api/status - Get current system status
app.get('/api/status', (req, res) => {
    const state = flexicart.getState();
    res.json({
        status: 'success',
        data: {
            operational_state: state.system.getOperationalState(),
            ready: state.system.isReady(),
            current_bin: state.system.movement.currentBin,
            on_air: state.system.onAir.tallyOn,
            active_operations: state.operations.active.length
        }
    });
});

// GET /api/inventory - Get inventory information
app.get('/api/inventory', (req, res) => {
    const inventory = flexicart.getInventory();
    const stats = inventory.getOccupancyStats();
    const occupied = inventory.getOccupiedBins();
    
    res.json({
        status: 'success',
        data: {
            stats: stats,
            occupied_bins: occupied
        }
    });
});

// POST /api/move/:position - Move to specific position
app.post('/api/move/:position', async (req, res) => {
    try {
        const position = parseInt(req.params.position);
        const result = await flexicart.moveToPosition(position);
        
        res.json({
            status: 'success',
            data: {
                operation_id: result.operationId,
                message: 'Movement initiated'
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// POST /api/tally/:state - Control ON-AIR tally
app.post('/api/tally/:state', async (req, res) => {
    try {
        const on = req.params.state === 'on';
        const result = await flexicart.setOnAirTally(on);
        
        res.json({
            status: 'success',
            data: {
                tally_on: on,
                command_success: result.success
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// WebSocket for real-time updates
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3001 });

// Broadcast state changes to connected clients
flexicart.on('statusUpdate', (status) => {
    const message = {
        type: 'status_update',
        data: {
            operational_state: status.getOperationalState(),
            current_bin: status.movement.currentBin,
            timestamp: new Date().toISOString()
        }
    };
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
});

flexicart.on('operationComplete', (operationId) => {
    const operation = flexicart.stateManager.operations.getOperation(operationId);
    const message = {
        type: 'operation_complete',
        data: {
            operation_id: operationId,
            type: operation.type,
            duration: operation.duration,
            success: operation.status === 'completed'
        }
    };
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
});
    `);
}

// Run demo if called directly
if (require.main === module) {
    flexiCartStateDemo()
        .then(() => {
            webApiIntegrationExample();
            console.log('\n🎉 All examples completed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Example failed:', error.message);
            process.exit(1);
        });
}

module.exports = {
    flexiCartStateDemo,
    webApiIntegrationExample
};
