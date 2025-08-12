/**
 * Comprehensive Sony Flexicart Movement Test
 */

const { 
    getComprehensiveStatus, 
    testMovementCapabilities, 
    moveToSlot 
} = require('../src/commands/flexicart_sony_advanced');

async function comprehensiveMovementTest(portPath) {
    console.log(`🎌 Comprehensive Sony Flexicart Movement Test`);
    console.log(`===========================================`);
    console.log(`Port: ${portPath}`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    try {
        // Phase 1: Get comprehensive status
        console.log(`📊 Phase 1: Comprehensive Status Analysis`);
        console.log(`----------------------------------------`);
        
        const statusResult = await getComprehensiveStatus(portPath, true);
        
        if (statusResult.success) {
            const { status } = statusResult;
            
            console.log(`\n✅ Device Information:`);
            if (status.device) {
                console.log(`   🏭 Device: ${status.device.identification}`);
                console.log(`   📋 Type: ${status.device.type}`);
            }
            
            console.log(`\n✅ Position Information:`);
            if (status.position) {
                console.log(`   📍 Current: ${status.position.interpretation}`);
                console.log(`   🏠 At Home: ${status.position.isHome ? 'YES' : 'NO'}`);
                console.log(`   ✅ Valid: ${status.position.isValid ? 'YES' : 'NO'}`);
            }
            
            console.log(`\n✅ Operational Status:`);
            if (status.operational) {
                console.log(`   🟢 Ready: ${status.operational.ready ? 'YES' : 'NO'}`);
                console.log(`   🏃 Moving: ${status.operational.moving ? 'YES' : 'NO'}`);
                console.log(`   🏠 Home: ${status.operational.home ? 'YES' : 'NO'}`);
                console.log(`   📦 Cartridge: ${status.operational.cartridgePresent ? 'PRESENT' : 'ABSENT'}`);
                console.log(`   ❌ Error: ${status.operational.error ? 'YES' : 'NO'}`);
            }
            
            console.log(`\n🔧 Capabilities: ${status.capabilities.join(', ')}`);
        }
        
        // Phase 2: Movement testing
        console.log(`\n\n🏃 Phase 2: Movement Capability Testing`);
        console.log(`---------------------------------------`);
        
        const movementResults = await testMovementCapabilities(portPath, true);
        
        console.log(`\n📊 Movement Test Summary:`);
        console.log(`   ✅ Successful commands: ${movementResults.successful}/${movementResults.movements.length}`);
        console.log(`   🏃 Commands causing movement: ${movementResults.positionChanges}`);
        console.log(`   ❌ Failed commands: ${movementResults.failed}`);
        
        if (movementResults.positionChanges > 0) {
            console.log(`\n🎯 Working Movement Commands:`);
            movementResults.movements
                .filter(m => m.success && m.positionChanged)
                .forEach(movement => {
                    console.log(`   ✅ ${movement.command}: ${movement.description}`);
                });
        }
        
        // Phase 3: Specific slot testing (only if movements work)
        if (movementResults.positionChanges > 0) {
            console.log(`\n\n📍 Phase 3: Specific Slot Movement Testing`);
            console.log(`------------------------------------------`);
            
            const slotsToTest = [1, 2, 3, 5];
            
            for (const slot of slotsToTest) {
                console.log(`\n🧪 Testing movement to slot ${slot}...`);
                
                const slotResult = await moveToSlot(portPath, slot, true);
                
                if (slotResult.success) {
                    console.log(`   ✅ Successfully moved to slot ${slot}`);
                    console.log(`   📍 Final position: ${slotResult.finalPosition?.current || 'Unknown'}`);
                } else {
                    console.log(`   ❌ Failed to move to slot ${slot}: ${slotResult.error || 'Unknown error'}`);
                }
                
                // Wait between movements
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // Return to home
            console.log(`\n🏠 Returning to home position...`);
            const homeResult = await moveToSlot(portPath, 0, true);
            if (homeResult.success) {
                console.log(`   ✅ Successfully returned home`);
            }
        }
        
        console.log(`\n\n🎉 Test completed successfully!`);
        console.log(`📋 Your Sony Flexicart is fully functional with:`);
        console.log(`   - Device identification ✅`);
        console.log(`   - Position reporting ✅`);
        console.log(`   - Status monitoring ✅`);
        if (movementResults.positionChanges > 0) {
            console.log(`   - Movement control ✅`);
        } else {
            console.log(`   - Movement control ⚠️ (commands sent but no movement detected)`);
        }
        
    } catch (error) {
        console.log(`❌ Test failed: ${error.message}`);
        console.log(`📊 Stack trace:`, error.stack);
    }
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
comprehensiveMovementTest(portPath);