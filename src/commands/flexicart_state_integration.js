/**
 * FlexiCart State Integration
 * Integrates the data structures with actual FlexiCart communication
 */

const { FlexiCartStateManager } = require('./flexicart_data_structures');
const { SerialPort } = require('serialport');

/**
 * FlexiCart State Integration Class
 * Bridges FlexiCart hardware communication with state management
 */
class FlexiCartStateIntegration {
    constructor(port = '/dev/ttyRP0', cartId = 'FC01') {
        this.port = port;
        this.cartId = cartId;
        this.stateManager = new FlexiCartStateManager(cartId, 360);
        this.serialPort = null;
        this.isConnected = false;
        
        // Communication settings
        this.config = {
            baudRate: 38400,
            dataBits: 8,
            parity: 'even',
            stopBits: 1,
            timeout: 5000,
            pollInterval: 1000 // Poll status every second
        };
        
        // Polling timer
        this.statusPollTimer = null;
        this.inventoryPollTimer = null;
        
        // Response parsers
        this.responseParsers = {
            status: this.parseStatusResponse.bind(this),
            position: this.parsePositionResponse.bind(this),
            inventory: this.parseInventoryResponse.bind(this),
            error: this.parseErrorResponse.bind(this)
        };
        
        // Setup event forwarding
        this.setupEventForwarding();
    }
    
    /**
     * Connect to FlexiCart device
     */
    async connect() {
        try {
            console.log(`🔌 Connecting to FlexiCart at ${this.port}...`);
            
            this.serialPort = new SerialPort({
                path: this.port,
                baudRate: this.config.baudRate,
                dataBits: this.config.dataBits,
                parity: this.config.parity,
                stopBits: this.config.stopBits,
                autoOpen: false
            });
            
            await new Promise((resolve, reject) => {
                this.serialPort.open((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
            
            this.isConnected = true;
            console.log('✅ Connected to FlexiCart');
            
            // Update connection status
            this.stateManager.systemStatus.communication.connected = true;
            this.stateManager.systemStatus.communication.lastResponseTime = new Date().toISOString();
            
            // Start periodic status polling
            this.startStatusPolling();
            
            // Initial status query
            await this.queryStatus();
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to connect:', error.message);
            this.isConnected = false;
            this.stateManager.systemStatus.communication.connected = false;
            throw error;
        }
    }
    
    /**
     * Disconnect from FlexiCart device
     */
    async disconnect() {
        this.stopStatusPolling();
        
        if (this.serialPort && this.serialPort.isOpen) {
            await new Promise((resolve) => {
                this.serialPort.close(() => resolve());
            });
        }
        
        this.isConnected = false;
        this.stateManager.systemStatus.communication.connected = false;
        console.log('🔌 Disconnected from FlexiCart');
    }
    
    /**
     * Send command to FlexiCart and update state
     */
    async sendCommand(cmd, ctrl = 0x00, data = 0x80, cartAddress = 0x01) {
        if (!this.isConnected) {
            throw new Error('Not connected to FlexiCart');
        }
        
        const command = this.createFlexiCartCommand(cmd, ctrl, data, cartAddress);
        const commandName = this.getCommandName(cmd, ctrl);
        
        // Start operation tracking for macro commands
        let operationId = null;
        if (this.isMacroCommand(cmd)) {
            operationId = this.stateManager.operations.startOperation(
                this.getOperationType(cmd, ctrl),
                { command: commandName, cmd, ctrl, data }
            );
        }
        
        try {
            const response = await this.sendRawCommand(command);
            const analysis = this.analyzeResponse(response);
            
            // Update communication stats
            this.stateManager.systemStatus.communication.lastResponseTime = new Date().toISOString();
            this.stateManager.systemStatus.communication.errorCount = 0;
            
            // Handle different response types
            if (analysis.isACK && operationId) {
                // Macro command accepted - start monitoring
                this.stateManager.operations.updateOperation(operationId, {
                    status: 'in_progress'
                });
                this.monitorMacroOperation(operationId, cmd);
                
            } else if (analysis.isNACK && operationId) {
                // Macro command rejected
                this.stateManager.operations.updateOperation(operationId, {
                    status: 'failed',
                    error: 'Command rejected (NACK)'
                });
                
            } else if (analysis.hasData) {
                // Immediate response with data
                this.parseAndUpdateState(cmd, ctrl, response);
            }
            
            return {
                success: true,
                operationId,
                response: analysis,
                commandName
            };
            
        } catch (error) {
            // Update error stats
            this.stateManager.systemStatus.communication.errorCount++;
            this.stateManager.systemStatus.errors.communication.push({
                command: commandName,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            if (operationId) {
                this.stateManager.operations.updateOperation(operationId, {
                    status: 'failed',
                    error: error.message
                });
            }
            
            throw error;
        }
    }
    
    /**
     * Query current status
     */
    async queryStatus() {
        return this.sendCommand(0x61, 0x10, 0x80); // STATUS_REQUEST
    }
    
    /**
     * Query current position
     */
    async queryPosition() {
        return this.sendCommand(0x61, 0x20, 0x80); // POSITION_REQUEST
    }
    
    /**
     * Query inventory
     */
    async queryInventory() {
        return this.sendCommand(0x61, 0x30, 0x80); // INVENTORY_REQUEST
    }
    
    /**
     * Control ON-AIR tally
     */
    async setOnAirTally(on) {
        return this.sendCommand(0x71, on ? 0x01 : 0x00, 0x80);
    }
    
    /**
     * Move elevator up
     */
    async moveElevatorUp() {
        return this.sendCommand(0x41, 0x01, 0x80);
    }
    
    /**
     * Move elevator down
     */
    async moveElevatorDown() {
        return this.sendCommand(0x41, 0x02, 0x80);
    }
    
    /**
     * Rotate carousel clockwise
     */
    async rotateCarouselCW() {
        return this.sendCommand(0x42, 0x01, 0x80);
    }
    
    /**
     * Rotate carousel counter-clockwise
     */
    async rotateCarouselCCW() {
        return this.sendCommand(0x42, 0x02, 0x80);
    }
    
    /**
     * Move to specific position
     */
    async moveToPosition(position) {
        if (position < 1 || position > 360) {
            throw new Error('Invalid position. Must be 1-360');
        }
        return this.sendCommand(0x43, position & 0xFF, 0x80);
    }
    
    /**
     * Load cart from current position
     */
    async loadCart() {
        return this.sendCommand(0x44, 0x01, 0x80);
    }
    
    /**
     * Unload cart to current position
     */
    async unloadCart() {
        return this.sendCommand(0x44, 0x02, 0x80);
    }
    
    /**
     * Get current complete state
     */
    getState() {
        return this.stateManager.getState();
    }
    
    /**
     * Get system status
     */
    getSystemStatus() {
        return this.stateManager.systemStatus;
    }
    
    /**
     * Get inventory
     */
    getInventory() {
        return this.stateManager.inventory;
    }
    
    /**
     * Get active operations
     */
    getActiveOperations() {
        return this.stateManager.operations.getActiveOperations();
    }
    
    /**
     * Add event listener
     */
    on(event, handler) {
        this.stateManager.on(event, handler);
    }
    
    /**
     * Setup event forwarding
     */
    setupEventForwarding() {
        // Forward state manager events
        this.stateManager.on('statusUpdate', (status) => {
            console.log(`📊 Status updated - State: ${status.getOperationalState()}`);
        });
        
        this.stateManager.on('inventoryUpdate', (stats) => {
            console.log(`📦 Inventory updated - ${stats.occupied}/${stats.totalBins} bins occupied`);
        });
        
        this.stateManager.on('operationComplete', (operationId) => {
            const operation = this.stateManager.operations.getOperation(operationId);
            console.log(`✅ Operation completed: ${operation.type} (${operation.duration}ms)`);
        });
    }
    
    /**
     * Start periodic status polling
     */
    startStatusPolling() {
        if (this.statusPollTimer) return;
        
        this.statusPollTimer = setInterval(async () => {
            try {
                await this.queryStatus();
            } catch (error) {
                console.log('⚠️  Status poll failed:', error.message);
            }
        }, this.config.pollInterval);
        
        // Less frequent inventory polling (every 30 seconds)
        this.inventoryPollTimer = setInterval(async () => {
            try {
                await this.queryInventory();
            } catch (error) {
                console.log('⚠️  Inventory poll failed:', error.message);
            }
        }, 30000);
    }
    
    /**
     * Stop periodic polling
     */
    stopStatusPolling() {
        if (this.statusPollTimer) {
            clearInterval(this.statusPollTimer);
            this.statusPollTimer = null;
        }
        
        if (this.inventoryPollTimer) {
            clearInterval(this.inventoryPollTimer);
            this.inventoryPollTimer = null;
        }
    }
    
    /**
     * Parse response and update appropriate state
     */
    parseAndUpdateState(cmd, ctrl, response) {
        const responseType = this.getResponseType(cmd, ctrl);
        const parsedData = this.responseParsers[responseType]?.(response) || {};
        
        this.stateManager.updateFromResponse(responseType, parsedData);
    }
    
    /**
     * Parse status response
     */
    parseStatusResponse(response) {
        if (!response || response.length < 5) {
            return { communication: { connected: true } };
        }
        
        // Parse FlexiCart status response format
        // This would be implemented based on actual response format
        return {
            communication: {
                connected: true,
                responseTimeMs: Date.now() % 1000 // Simplified
            },
            hardware: {
                powerOn: true,
                initialized: (response[5] & 0x01) !== 0,
                emergencyStop: (response[5] & 0x02) !== 0
            },
            movement: {
                elevator: {
                    moving: (response[6] & 0x01) !== 0,
                    position: response[7] || 0
                },
                carousel: {
                    moving: (response[6] & 0x02) !== 0,
                    position: response[8] || 0
                }
            }
        };
    }
    
    /**
     * Parse position response
     */
    parsePositionResponse(response) {
        if (!response || response.length < 8) return {};
        
        return {
            movement: {
                currentBin: response[7] || 0,
                elevator: { position: response[6] || 0 },
                carousel: { position: response[8] || 0 }
            }
        };
    }
    
    /**
     * Parse inventory response
     */
    parseInventoryResponse(response) {
        // Simplified inventory parsing
        // Real implementation would decode actual inventory data
        return {
            bins: [
                // This would be populated from actual response parsing
            ]
        };
    }
    
    /**
     * Parse error response
     */
    parseErrorResponse(response) {
        return {
            errors: response && response.length > 5 ? [
                {
                    code: response[5],
                    message: `Error code: 0x${response[5]?.toString(16)}`,
                    timestamp: new Date().toISOString()
                }
            ] : []
        };
    }
    
    /**
     * Monitor macro operation completion
     */
    async monitorMacroOperation(operationId, cmd) {
        const maxPolls = 50; // 5 seconds at 100ms intervals
        let polls = 0;
        
        const pollInterval = setInterval(async () => {
            polls++;
            
            try {
                // Query status to check if operation completed
                const statusResult = await this.queryStatus();
                
                // Simple completion check - in real implementation,
                // this would check specific status bits
                const isComplete = !this.isMovementActive();
                
                if (isComplete) {
                    clearInterval(pollInterval);
                    this.stateManager.operations.updateOperation(operationId, {
                        status: 'completed',
                        result: { success: true }
                    });
                } else if (polls >= maxPolls) {
                    clearInterval(pollInterval);
                    this.stateManager.operations.updateOperation(operationId, {
                        status: 'timeout',
                        error: 'Operation monitoring timeout'
                    });
                }
            } catch (error) {
                clearInterval(pollInterval);
                this.stateManager.operations.updateOperation(operationId, {
                    status: 'failed',
                    error: error.message
                });
            }
        }, 100);
    }
    
    /**
     * Check if movement is currently active
     */
    isMovementActive() {
        const status = this.stateManager.systemStatus;
        return status.movement.elevator.moving || status.movement.carousel.moving;
    }
    
    /**
     * Helper methods for command analysis
     */
    isMacroCommand(cmd) {
        // Commands that require ACK/NACK + polling
        return [0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47].includes(cmd);
    }
    
    getOperationType(cmd, ctrl) {
        const types = {
            0x41: 'elevator_move',
            0x42: 'carousel_rotate',
            0x43: 'move_to_position',
            0x44: ctrl === 0x01 ? 'load_cart' : 'unload_cart',
            0x45: 'eject_cart',
            0x46: 'initialize',
            0x47: 'calibrate'
        };
        return types[cmd] || 'unknown';
    }
    
    getCommandName(cmd, ctrl) {
        // Map command bytes to readable names
        const commands = {
            0x61: ctrl === 0x10 ? 'STATUS_REQUEST' : 
                  ctrl === 0x20 ? 'POSITION_REQUEST' :
                  ctrl === 0x30 ? 'INVENTORY_REQUEST' :
                  ctrl === 0x40 ? 'ERROR_STATUS' : 'QUERY',
            0x71: ctrl === 0x01 ? 'ON_AIR_TALLY_ON' : 'ON_AIR_TALLY_OFF',
            0x41: ctrl === 0x01 ? 'ELEVATOR_UP' : 'ELEVATOR_DOWN',
            0x42: ctrl === 0x01 ? 'CAROUSEL_CW' : 'CAROUSEL_CCW',
            0x43: 'MOVE_TO_POSITION',
            0x44: ctrl === 0x01 ? 'LOAD_CART' : 'UNLOAD_CART',
            0x45: 'EJECT_CART',
            0x46: 'INITIALIZE',
            0x47: 'CALIBRATE'
        };
        return commands[cmd] || `CMD_${cmd.toString(16).toUpperCase()}`;
    }
    
    getResponseType(cmd, ctrl) {
        if (cmd === 0x61) {
            switch (ctrl) {
                case 0x10: return 'status';
                case 0x20: return 'position';
                case 0x30: return 'inventory';
                case 0x40: return 'error';
            }
        }
        return 'status'; // Default
    }
    
    /**
     * Create FlexiCart command buffer
     */
    createFlexiCartCommand(cmd, ctrl = 0x00, data = 0x80, cartAddress = 0x01) {
        const command = Buffer.alloc(9);
        command[0] = 0x02;          // STX
        command[1] = 0x06;          // BC
        command[2] = 0x01;          // UA1
        command[3] = cartAddress;   // UA2
        command[4] = 0x00;          // BT
        command[5] = cmd;           // CMD
        command[6] = ctrl;          // CTRL
        command[7] = data;          // DATA
        
        // Calculate 2's complement checksum
        let sum = 0;
        for (let i = 1; i < 8; i++) {
            sum += command[i];
        }
        command[8] = (0x100 - (sum & 0xFF)) & 0xFF;  // CS
        
        return command;
    }
    
    /**
     * Send raw command and get response
     */
    sendRawCommand(command, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let timeoutHandle;
            
            const cleanup = () => {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                this.serialPort.removeAllListeners('data');
            };
            
            this.serialPort.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            this.serialPort.write(command, (writeError) => {
                if (writeError) {
                    cleanup();
                    reject(new Error(`Write failed: ${writeError.message}`));
                    return;
                }
                
                this.serialPort.drain(() => {
                    timeoutHandle = setTimeout(() => {
                        cleanup();
                        const response = Buffer.concat(chunks);
                        resolve(response);
                    }, timeout);
                });
            });
        });
    }
    
    /**
     * Analyze response
     */
    analyzeResponse(response) {
        const analysis = {
            length: response.length,
            hex: response.toString('hex').match(/.{2}/g)?.join(' ') || '',
            bytes: Array.from(response),
            isACK: false,
            isNACK: false,
            hasData: false
        };
        
        if (response.length === 0) {
            return analysis;
        }
        
        const firstByte = response[0];
        
        if (firstByte === 0x04) {
            analysis.isACK = true;
        } else if (firstByte === 0x05) {
            analysis.isNACK = true;
        } else {
            analysis.hasData = true;
        }
        
        return analysis;
    }
    
    /**
     * Cleanup resources
     */
    async destroy() {
        await this.disconnect();
        this.stateManager.destroy();
    }
}

module.exports = {
    FlexiCartStateIntegration
};
