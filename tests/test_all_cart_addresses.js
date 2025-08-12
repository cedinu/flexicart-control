/**
 * FlexiCart All Cart Addresses Test - Bit-mapped UA2 addressing
 */

const { sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * FlexiCart Bit-Mapped Addressing Protocol
 * UA2 uses bit mapping: cart1=0x01, cart2=0x02, cart3=0x04, cart4=0x08, etc.
 */
class FlexiCartAddressingProtocol {
    static STX = 0x02;  // Start of text
    
    /**
     * Cart address bit mapping (from Table 4-1 in documentation)
     */
    static CART_ADDRESSES = {
        cart1: 0x01,  // b0 = bit 0
        cart2: 0x02,  // b1 = bit 1  
        cart3: 0x04,  // b2 = bit 2
        cart4: 0x08,  // b3 = bit 3
        cart5: 0x10,  // b4 = bit 4
        cart6: 0x20,  // b5 = bit 5
        cart7: 0x40,  // b6 = bit 6
        cart8: 0x80   // b7 = bit 7
    };
    
    /**
     * Calculate checksum - sum from BC to CS becomes zero
     */
    static calculateChecksum(packet) {
        let sum = 0;
        // Sum from BC (index 1) to DATA (exclude CS position)
        for (let i = 1; i < packet.length - 1; i++) {
            sum += packet[i];
        }
        // Return value that makes low-order byte zero
        return (0x100 - (sum & 0xFF)) & 0xFF;
    }
    
    /**
     * Create FlexiCart command packet with bit-mapped addressing
     */
    static createCommand(bt, cmd, control = 0x00, data = 0x80, cartBitMask = 0x01) {
        // Calculate proper byte count (UA1 to last data byte)
        const dataLength = 6; // UA1 + UA2 + BT + CMD + Control + DATA = 6 bytes
        const bc = dataLength;
        
        // Unit addressing - UA1=01H (FlexiCart), UA2 uses bit mapping
        const ua1 = 0x01; // Always 01H for FlexiCart
        const ua2 = cartBitMask; // Bit-mapped cart selection
        
        const packet = Buffer.alloc(9);
        packet[0] = this.STX;   // STX = 02H
        packet[1] = bc;         // BC = byte count
        packet[2] = ua1;        // UA1 = 01H (FlexiCart)
        packet[3] = ua2;        // UA2 = bit-mapped cart selection
        packet[4] = bt;         // BT = Block Type
        packet[5] = cmd;        // CMD = Command
        packet[6] = control;    // Control field
        packet[7] = data;       // DATA field
        packet[8] = this.calculateChecksum(packet); // CS = checksum
        
        return packet;
    }
    
    /**
     * Sense Cart Status command for specific cart
     */
    static getSenseCartStatus(cartBitMask) {
        // Sense Cart Status: BT=00H, CMD=61H
        return this.createCommand(0x00, 0x61, 0x00, 0x80, cartBitMask);
    }
    
    /**
     * Sense System Mode command for specific cart
     */
    static getSenseSystemMode(cartBitMask) {
        // Sense System Mode: BT=00H, CMD=65H
        return this.createCommand(0x00, 0x65, 0x00, 0x80, cartBitMask);
    }
    
    /**
     * Dummy command for communication test
     */
    static getDummy(cartBitMask) {
        // Dummy: BT=00H, CMD=50H
        return this.createCommand(0x00, 0x50, 0x00, 0x80, cartBitMask);
    }
    
    /**
     * On Air Tally commands for testing
     */
    static getOnAirTallySet(cartBitMask) {
        return this.createCommand(0x00, 0x0A, 0x00, 0x80, cartBitMask);
    }
    
    static getOnAirTallyReset(cartBitMask) {
        return this.createCommand(0x00, 0x0A, 0x01, 0x80, cartBitMask);
    }
}

/**
 * Test all FlexiCart addresses with Sense Cart Status and Sense System Mode
 */
async function testAllCartAddresses(portPath) {
    console.log(`📀 FlexiCart All Cart Addresses Test`);
    console.log(`===================================`);
    console.log(`Testing bit-mapped UA2 addressing for all 8 carts`);
    console.log(`Port: ${portPath}`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    const results = {
        cartResponses: {},
        workingCarts: [],
        acknowledgments: [],
        statusData: {}
    };
    
    try {
        // Test each cart address (1-8)
        for (const [cartName, cartBitMask] of Object.entries(FlexiCartAddressingProtocol.CART_ADDRESSES)) {
            const cartNum = parseInt(cartName.replace('cart', ''));
            
            console.log(`\n🎯 Testing ${cartName.toUpperCase()} (UA2 = 0x${cartBitMask.toString(16).toUpperCase().padStart(2, '0')})`);
            console.log(`${'='.repeat(50)}`);
            
            results.cartResponses[cartName] = {
                bitMask: cartBitMask,
                responses: {},
                working: false,
                acknowledgments: []
            };
            
            // Test 1: Dummy command (communication test)
            console.log(`\n📡 Step 1: Communication Test (Dummy Command)`);
            console.log(`---------------------------------------------`);
            
            const dummyCmd = FlexiCartAddressingProtocol.getDummy(cartBitMask);
            console.log(`   📤 Dummy command: ${dummyCmd.toString('hex').toUpperCase()}`);
            console.log(`   📊 Breakdown: STX=${dummyCmd[0].toString(16).toUpperCase()} BC=${dummyCmd[1].toString(16).toUpperCase()} UA1=${dummyCmd[2].toString(16).toUpperCase()} UA2=${dummyCmd[3].toString(16).toUpperCase()} BT=${dummyCmd[4].toString(16).toUpperCase()} CMD=${dummyCmd[5].toString(16).toUpperCase()}`);
            
            try {
                const dummyResponse = await sendCommand(portPath, dummyCmd, 3000, false);
                console.log(`   📥 Response: ${dummyResponse.length} bytes`);
                
                if (dummyResponse.length > 0) {
                    console.log(`   📊 Response hex: ${dummyResponse.slice(0, 20).toString('hex').toUpperCase()}`);
                    
                    // Check for ACK/NAK/BUSY
                    if (dummyResponse.includes(0x04)) {
                        console.log(`   ✅ ACK received - ${cartName} is RESPONDING!`);
                        results.cartResponses[cartName].acknowledgments.push('DUMMY_ACK');
                        results.acknowledgments.push({ cart: cartName, command: 'DUMMY', type: 'ACK' });
                        results.workingCarts.push(cartName);
                        results.cartResponses[cartName].working = true;
                    } else if (dummyResponse.includes(0x05)) {
                        console.log(`   ❌ NAK received - ${cartName} rejected command`);
                        results.cartResponses[cartName].acknowledgments.push('DUMMY_NAK');
                        results.acknowledgments.push({ cart: cartName, command: 'DUMMY', type: 'NAK' });
                    } else if (dummyResponse.includes(0x06)) {
                        console.log(`   ⏳ BUSY received - ${cartName} is busy`);
                        results.cartResponses[cartName].acknowledgments.push('DUMMY_BUSY');
                        results.acknowledgments.push({ cart: cartName, command: 'DUMMY', type: 'BUSY' });
                    } else {
                        console.log(`   📊 Other response from ${cartName}`);
                        // Check for meaningful data
                        const meaningfulBytes = dummyResponse.filter(b => b !== 0x55 && b !== 0x00);
                        if (meaningfulBytes.length > 3) {
                            console.log(`   📊 Meaningful data detected: ${meaningfulBytes.slice(0, 10).toString('hex').toUpperCase()}`);
                            results.cartResponses[cartName].working = true;
                        }
                    }
                    
                    results.cartResponses[cartName].responses.dummy = dummyResponse.slice(0, 15).toString('hex');
                }
                
            } catch (error) {
                console.log(`   ❌ Dummy command error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Test 2: Sense Cart Status
            console.log(`\n📊 Step 2: Sense Cart Status`);
            console.log(`----------------------------`);
            
            const statusCmd = FlexiCartAddressingProtocol.getSenseCartStatus(cartBitMask);
            console.log(`   📤 Status command: ${statusCmd.toString('hex').toUpperCase()}`);
            console.log(`   📋 Command: Sense Cart Status (00H, 61H)`);
            
            try {
                const statusResponse = await sendCommand(portPath, statusCmd, 4000, false);
                console.log(`   📥 Response: ${statusResponse.length} bytes`);
                
                if (statusResponse.length > 0) {
                    console.log(`   📊 Response hex: ${statusResponse.slice(0, 20).toString('hex').toUpperCase()}`);
                    
                    // Look for Cart Status Return (71H) or meaningful status data
                    if (statusResponse.includes(0x71)) {
                        console.log(`   ✅ Cart Status Return (71H) detected!`);
                        results.cartResponses[cartName].acknowledgments.push('STATUS_RETURN');
                        results.acknowledgments.push({ cart: cartName, command: 'STATUS', type: 'RETURN' });
                    } else if (statusResponse.includes(0x04)) {
                        console.log(`   ✅ ACK received for status query`);
                        results.cartResponses[cartName].acknowledgments.push('STATUS_ACK');
                    } else if (statusResponse.includes(0x05)) {
                        console.log(`   ❌ NAK received for status query`);
                        results.cartResponses[cartName].acknowledgments.push('STATUS_NAK');
                    }
                    
                    // Analyze status data
                    const meaningfulBytes = statusResponse.filter(b => b !== 0x55 && b !== 0x00 && b !== 0xFF);
                    if (meaningfulBytes.length > 0) {
                        console.log(`   📊 Status data: ${meaningfulBytes.slice(0, 8).toString('hex').toUpperCase()}`);
                        results.statusData[cartName] = {
                            status: meaningfulBytes.slice(0, 8).toString('hex'),
                            fullResponse: statusResponse.slice(0, 20).toString('hex')
                        };
                    }
                    
                    results.cartResponses[cartName].responses.status = statusResponse.slice(0, 20).toString('hex');
                }
                
            } catch (error) {
                console.log(`   ❌ Status command error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Test 3: Sense System Mode
            console.log(`\n🔧 Step 3: Sense System Mode`);
            console.log(`----------------------------`);
            
            const systemModeCmd = FlexiCartAddressingProtocol.getSenseSystemMode(cartBitMask);
            console.log(`   📤 System Mode command: ${systemModeCmd.toString('hex').toUpperCase()}`);
            console.log(`   📋 Command: Sense System Mode (00H, 65H)`);
            
            try {
                const systemResponse = await sendCommand(portPath, systemModeCmd, 4000, false);
                console.log(`   📥 Response: ${systemResponse.length} bytes`);
                
                if (systemResponse.length > 0) {
                    console.log(`   📊 Response hex: ${systemResponse.slice(0, 20).toString('hex').toUpperCase()}`);
                    
                    // Look for System Mode Return (75H) or meaningful data
                    if (systemResponse.includes(0x75)) {
                        console.log(`   ✅ System Mode Return (75H) detected!`);
                        results.cartResponses[cartName].acknowledgments.push('SYSTEM_MODE_RETURN');
                        results.acknowledgments.push({ cart: cartName, command: 'SYSTEM_MODE', type: 'RETURN' });
                    } else if (systemResponse.includes(0x04)) {
                        console.log(`   ✅ ACK received for system mode query`);
                        results.cartResponses[cartName].acknowledgments.push('SYSTEM_MODE_ACK');
                    }
                    
                    // Analyze system mode data
                    const meaningfulBytes = systemResponse.filter(b => b !== 0x55 && b !== 0x00 && b !== 0xFF);
                    if (meaningfulBytes.length > 0) {
                        console.log(`   📊 System mode data: ${meaningfulBytes.slice(0, 8).toString('hex').toUpperCase()}`);
                        
                        if (!results.statusData[cartName]) {
                            results.statusData[cartName] = {};
                        }
                        results.statusData[cartName].systemMode = meaningfulBytes.slice(0, 8).toString('hex');
                    }
                    
                    results.cartResponses[cartName].responses.systemMode = systemResponse.slice(0, 20).toString('hex');
                }
                
            } catch (error) {
                console.log(`   ❌ System mode command error: ${error.message}`);
            }
            
            // Summary for this cart
            console.log(`\n📋 ${cartName.toUpperCase()} Summary:`);
            console.log(`   Working: ${results.cartResponses[cartName].working ? 'YES' : 'NO'}`);
            console.log(`   Acknowledgments: ${results.cartResponses[cartName].acknowledgments.join(', ') || 'None'}`);
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Comprehensive Results Analysis
        console.log(`\n\n📊 COMPLETE CART ADDRESS TEST RESULTS`);
        console.log(`=====================================`);
        console.log(`Total carts tested: 8`);
        console.log(`Working carts: ${results.workingCarts.length}`);
        console.log(`Total acknowledgments: ${results.acknowledgments.length}`);
        
        if (results.workingCarts.length > 0) {
            console.log(`\n✅ WORKING CARTS DETECTED:`);
            console.log(`=========================`);
            
            results.workingCarts.forEach(cartName => {
                const cartData = results.cartResponses[cartName];
                const cartNum = parseInt(cartName.replace('cart', ''));
                const bitMask = cartData.bitMask;
                
                console.log(`\n🎯 ${cartName.toUpperCase()} (Cart ${cartNum})`);
                console.log(`   📍 UA2 Bit Mask: 0x${bitMask.toString(16).toUpperCase().padStart(2, '0')} (bit ${Math.log2(bitMask)})`);
                console.log(`   📊 Acknowledgments: ${cartData.acknowledgments.join(', ')}`);
                
                if (results.statusData[cartName]) {
                    if (results.statusData[cartName].status) {
                        console.log(`   📊 Cart Status: ${results.statusData[cartName].status}`);
                    }
                    if (results.statusData[cartName].systemMode) {
                        console.log(`   🔧 System Mode: ${results.statusData[cartName].systemMode}`);
                    }
                }
                
                // Generate working commands for this cart
                console.log(`\n   🔧 Working Commands for ${cartName.toUpperCase()}:`);
                const statusCmd = FlexiCartAddressingProtocol.getSenseCartStatus(bitMask);
                const systemCmd = FlexiCartAddressingProtocol.getSenseSystemMode(bitMask);
                const onAirSetCmd = FlexiCartAddressingProtocol.getOnAirTallySet(bitMask);
                const onAirResetCmd = FlexiCartAddressingProtocol.getOnAirTallyReset(bitMask);
                
                console.log(`   const ${cartName}SenseStatus = Buffer.from([${statusCmd.join(', ')}]);`);
                console.log(`   const ${cartName}SenseSystemMode = Buffer.from([${systemCmd.join(', ')}]);`);
                console.log(`   const ${cartName}OnAirSet = Buffer.from([${onAirSetCmd.join(', ')}]);`);
                console.log(`   const ${cartName}OnAirReset = Buffer.from([${onAirResetCmd.join(', ')}]);`);
            });
            
            console.log(`\n🎉 SUCCESS! Found ${results.workingCarts.length} working FlexiCart(s)!`);
            
            // Test On Air control on working carts
            if (results.workingCarts.length > 0) {
                console.log(`\n\n🚨 BONUS: Testing On Air Control on Working Carts`);
                console.log(`=================================================`);
                
                for (const cartName of results.workingCarts.slice(0, 2)) { // Test first 2 working carts
                    const bitMask = results.cartResponses[cartName].bitMask;
                    
                    console.log(`\n🎯 Testing On Air control for ${cartName.toUpperCase()}`);
                    
                    // Test On Air Set
                    const onAirSetCmd = FlexiCartAddressingProtocol.getOnAirTallySet(bitMask);
                    console.log(`   📤 On Air SET: ${onAirSetCmd.toString('hex').toUpperCase()}`);
                    console.log(`   👀 WATCH FOR LED CHANGES ON THE DEVICE!`);
                    
                    try {
                        const setResponse = await sendCommand(portPath, onAirSetCmd, 3000, false);
                        console.log(`   📥 Set response: ${setResponse.length} bytes`);
                        
                        if (setResponse.includes(0x04)) {
                            console.log(`   ✅ On Air SET - ACK received!`);
                            console.log(`   💡 Check ${cartName.toUpperCase()} for ON AIR LED!`);
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        // Test On Air Reset
                        const onAirResetCmd = FlexiCartAddressingProtocol.getOnAirTallyReset(bitMask);
                        console.log(`   📤 On Air RESET: ${onAirResetCmd.toString('hex').toUpperCase()}`);
                        
                        const resetResponse = await sendCommand(portPath, onAirResetCmd, 3000, false);
                        console.log(`   📥 Reset response: ${resetResponse.length} bytes`);
                        
                        if (resetResponse.includes(0x04)) {
                            console.log(`   ✅ On Air RESET - ACK received!`);
                            console.log(`   💡 Check ${cartName.toUpperCase()} - LED should be OFF!`);
                        }
                        
                    } catch (error) {
                        console.log(`   ❌ On Air test error: ${error.message}`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
        } else {
            console.log(`\n⚠️  No working carts detected with standard protocol.`);
            console.log(`   All carts may be:`);
            console.log(`   - Using different addressing scheme`);
            console.log(`   - In offline/maintenance mode`);
            console.log(`   - Require initialization sequence`);
            console.log(`   - Using different communication parameters`);
        }
        
        // Generate final summary table
        console.log(`\n\n📋 FINAL CART ADDRESS SUMMARY TABLE`);
        console.log(`===================================`);
        console.log(`Cart | UA2 Bit | Hex  | Working | Acknowledgments`);
        console.log(`-----|---------|------|---------|----------------`);
        
        for (const [cartName, cartData] of Object.entries(results.cartResponses)) {
            const cartNum = parseInt(cartName.replace('cart', ''));
            const bitPos = Math.log2(cartData.bitMask);
            const hex = '0x' + cartData.bitMask.toString(16).toUpperCase().padStart(2, '0');
            const working = cartData.working ? 'YES' : 'NO';
            const acks = cartData.acknowledgments.slice(0, 2).join(',') || 'None';
            
            console.log(`${cartNum.toString().padStart(4)} | ${`bit${bitPos}`.padStart(7)} | ${hex.padStart(4)} | ${working.padStart(7)} | ${acks}`);
        }
        
    } catch (error) {
        console.log(`❌ Cart address test failed: ${error.message}`);
    }
}

// Run the comprehensive cart address test
const portPath = process.argv[2] || '/dev/ttyRP8';
testAllCartAddresses(portPath);