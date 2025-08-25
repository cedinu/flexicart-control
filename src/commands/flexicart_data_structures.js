/**
 * FlexiCart Data Structures
 * Comprehensive data structures for tracking FlexiCart status, operations, and cassette occupancy
 */

/**
 * FlexiCart System Status Structure
 * Tracks overall system state and capabilities
 */
class FlexiCartSystemStatus {
    constructor(cartId = 'FC01', maxPositions = 360) {
        this.cartId = cartId;
        this.maxPositions = maxPositions;
        this.timestamp = new Date().toISOString();
        
        // Hardware status
        this.hardware = {
            powerOn: false,
            initialized: false,
            calibrated: false,
            emergencyStop: false,
            doorOpen: false,
            maintenanceMode: false
        };
        
        // Communication status
        this.communication = {
            connected: false,
            lastResponseTime: null,
            responseTimeMs: 0,
            errorCount: 0,
            ackResponse: 0x04,
            protocolVersion: '1.0'
        };
        
        // Movement system status
        this.movement = {
            elevator: {
                position: 0,
                moving: false,
                direction: 'stopped', // 'up', 'down', 'stopped'
                targetPosition: 0,
                calibrated: false
            },
            carousel: {
                position: 0,
                moving: false,
                direction: 'stopped', // 'cw', 'ccw', 'stopped'
                targetPosition: 0,
                calibrated: false
            },
            currentBin: 0, // Current bin number (1-360)
            movementLocked: false
        };
        
        // Player mechanism status
        this.player = {
            cartLoaded: false,
            cartId: null,
            playing: false,
            position: '00:00:00:00', // Timecode
            ready: false,
            error: false
        };
        
        // ON-AIR system
        this.onAir = {
            tallyOn: false,
            recordEnable: false,
            safetyInterlock: true
        };
        
        // Error status
        this.errors = {
            mechanical: [],
            communication: [],
            system: [],
            lastError: null
        };
    }
    
    /**
     * Update system status from parsed response data
     */
    updateFromResponse(responseData) {
        this.timestamp = new Date().toISOString();
        
        if (responseData.communication) {
            Object.assign(this.communication, responseData.communication);
        }
        
        if (responseData.movement) {
            Object.assign(this.movement, responseData.movement);
        }
        
        if (responseData.hardware) {
            Object.assign(this.hardware, responseData.hardware);
        }
        
        if (responseData.errors && responseData.errors.length > 0) {
            this.errors.system = responseData.errors;
            this.errors.lastError = responseData.errors[responseData.errors.length - 1];
        }
    }
    
    /**
     * Check if system is ready for operations
     */
    isReady() {
        return this.hardware.powerOn && 
               this.hardware.initialized && 
               this.communication.connected && 
               !this.hardware.emergencyStop &&
               !this.movement.movementLocked;
    }
    
    /**
     * Get current operational state
     */
    getOperationalState() {
        if (!this.communication.connected) return 'DISCONNECTED';
        if (this.hardware.emergencyStop) return 'EMERGENCY_STOP';
        if (!this.hardware.powerOn) return 'POWER_OFF';
        if (!this.hardware.initialized) return 'NOT_INITIALIZED';
        if (this.movement.movementLocked) return 'MOVEMENT_LOCKED';
        if (this.movement.elevator.moving || this.movement.carousel.moving) return 'MOVING';
        if (this.player.playing) return 'PLAYING';
        if (this.onAir.tallyOn) return 'ON_AIR';
        if (this.isReady()) return 'READY';
        return 'UNKNOWN';
    }
}

/**
 * In-Progress Operations Tracker
 * Tracks all ongoing operations and their status
 */
class FlexiCartOperations {
    constructor() {
        this.operations = new Map(); // operationId -> operation details
        this.operationQueue = []; // Queue of pending operations
        this.maxConcurrentOps = 1; // FlexiCart typically handles one operation at a time
        this.operationCounter = 0;
    }
    
    /**
     * Start a new operation
     */
    startOperation(type, details = {}) {
        const operationId = `op_${++this.operationCounter}_${Date.now()}`;
        
        const operation = {
            id: operationId,
            type: type, // 'move', 'load', 'unload', 'calibrate', 'initialize', etc.
            status: 'started', // 'started', 'in_progress', 'completed', 'failed', 'timeout'
            startTime: new Date().toISOString(),
            endTime: null,
            duration: 0,
            progress: 0, // 0-100%
            details: {
                ...details,
                expectedDuration: this.getExpectedDuration(type),
                timeoutMs: details.timeoutMs || 30000
            },
            steps: [],
            currentStep: null,
            error: null,
            result: null
        };
        
        this.operations.set(operationId, operation);
        return operationId;
    }
    
    /**
     * Update operation progress
     */
    updateOperation(operationId, updates) {
        const operation = this.operations.get(operationId);
        if (!operation) return false;
        
        Object.assign(operation, updates);
        
        if (updates.status === 'completed' || updates.status === 'failed') {
            operation.endTime = new Date().toISOString();
            operation.duration = new Date(operation.endTime) - new Date(operation.startTime);
        }
        
        return true;
    }
    
    /**
     * Add step to operation
     */
    addOperationStep(operationId, step) {
        const operation = this.operations.get(operationId);
        if (!operation) return false;
        
        const stepWithTimestamp = {
            ...step,
            timestamp: new Date().toISOString()
        };
        
        operation.steps.push(stepWithTimestamp);
        operation.currentStep = stepWithTimestamp;
        
        return true;
    }
    
    /**
     * Get active operations
     */
    getActiveOperations() {
        return Array.from(this.operations.values()).filter(
            op => op.status === 'started' || op.status === 'in_progress'
        );
    }
    
    /**
     * Get operation by ID
     */
    getOperation(operationId) {
        return this.operations.get(operationId);
    }
    
    /**
     * Check for timed out operations
     */
    checkTimeouts() {
        const now = new Date();
        const timedOut = [];
        
        for (const operation of this.operations.values()) {
            if (operation.status === 'started' || operation.status === 'in_progress') {
                const elapsed = now - new Date(operation.startTime);
                if (elapsed > operation.details.timeoutMs) {
                    operation.status = 'timeout';
                    operation.endTime = new Date().toISOString();
                    operation.error = `Operation timed out after ${elapsed}ms`;
                    timedOut.push(operation);
                }
            }
        }
        
        return timedOut;
    }
    
    /**
     * Get expected duration for operation type
     */
    getExpectedDuration(type) {
        const durations = {
            'move': 5000,      // 5 seconds for movement
            'load': 8000,      // 8 seconds to load cart
            'unload': 6000,    // 6 seconds to unload cart
            'calibrate': 30000, // 30 seconds for calibration
            'initialize': 45000, // 45 seconds for initialization
            'eject': 10000     // 10 seconds for cart ejection
        };
        
        return durations[type] || 10000; // Default 10 seconds
    }
    
    /**
     * Clean up old completed operations
     */
    cleanup(maxAge = 3600000) { // Default 1 hour
        const cutoff = new Date(Date.now() - maxAge);
        
        for (const [id, operation] of this.operations.entries()) {
            if (operation.endTime && new Date(operation.endTime) < cutoff) {
                this.operations.delete(id);
            }
        }
    }
}

/**
 * Cassette Bin Occupancy Tracker
 * Tracks which bins contain cassettes and their details
 */
class CassetteBinOccupancy {
    constructor(maxBins = 360) {
        this.maxBins = maxBins;
        this.bins = new Map(); // bin number -> cassette details
        this.lastInventoryUpdate = null;
        this.inventoryVersion = 1;
        
        // Initialize all bins as empty
        for (let i = 1; i <= maxBins; i++) {
            this.bins.set(i, {
                binNumber: i,
                occupied: false,
                cassette: null,
                lastAccessed: null,
                accessCount: 0
            });
        }
    }
    
    /**
     * Set cassette in specific bin
     */
    setCassette(binNumber, cassetteDetails) {
        if (binNumber < 1 || binNumber > this.maxBins) {
            throw new Error(`Invalid bin number: ${binNumber}. Must be 1-${this.maxBins}`);
        }
        
        const bin = this.bins.get(binNumber);
        bin.occupied = true;
        bin.cassette = {
            id: cassetteDetails.id || `CART_${binNumber}`,
            type: cassetteDetails.type || 'unknown', // 'A', 'B', 'C' (NAB cart types)
            length: cassetteDetails.length || 0, // in seconds
            title: cassetteDetails.title || '',
            artist: cassetteDetails.artist || '',
            duration: cassetteDetails.duration || '00:00:00',
            category: cassetteDetails.category || 'general',
            priority: cassetteDetails.priority || 'normal',
            playCount: cassetteDetails.playCount || 0,
            dateAdded: cassetteDetails.dateAdded || new Date().toISOString(),
            lastPlayed: cassetteDetails.lastPlayed || null,
            metadata: cassetteDetails.metadata || {}
        };
        bin.lastAccessed = new Date().toISOString();
        
        this.inventoryVersion++;
    }
    
    /**
     * Remove cassette from bin
     */
    removeCassette(binNumber) {
        if (binNumber < 1 || binNumber > this.maxBins) {
            throw new Error(`Invalid bin number: ${binNumber}`);
        }
        
        const bin = this.bins.get(binNumber);
        const removedCassette = bin.cassette;
        
        bin.occupied = false;
        bin.cassette = null;
        bin.lastAccessed = new Date().toISOString();
        
        this.inventoryVersion++;
        return removedCassette;
    }
    
    /**
     * Get cassette details from bin
     */
    getCassette(binNumber) {
        const bin = this.bins.get(binNumber);
        return bin ? bin.cassette : null;
    }
    
    /**
     * Check if bin is occupied
     */
    isBinOccupied(binNumber) {
        const bin = this.bins.get(binNumber);
        return bin ? bin.occupied : false;
    }
    
    /**
     * Get occupancy statistics
     */
    getOccupancyStats() {
        let occupied = 0;
        let empty = 0;
        
        for (const bin of this.bins.values()) {
            if (bin.occupied) occupied++;
            else empty++;
        }
        
        return {
            totalBins: this.maxBins,
            occupied: occupied,
            empty: empty,
            occupancyRate: (occupied / this.maxBins) * 100,
            emptyRate: (empty / this.maxBins) * 100,
            lastUpdated: this.lastInventoryUpdate,
            version: this.inventoryVersion
        };
    }
    
    /**
     * Get list of occupied bins
     */
    getOccupiedBins() {
        const occupied = [];
        for (const bin of this.bins.values()) {
            if (bin.occupied) {
                occupied.push({
                    binNumber: bin.binNumber,
                    cassette: bin.cassette,
                    lastAccessed: bin.lastAccessed,
                    accessCount: bin.accessCount
                });
            }
        }
        return occupied.sort((a, b) => a.binNumber - b.binNumber);
    }
    
    /**
     * Get list of empty bins
     */
    getEmptyBins() {
        const empty = [];
        for (const bin of this.bins.values()) {
            if (!bin.occupied) {
                empty.push(bin.binNumber);
            }
        }
        return empty.sort((a, b) => a - b);
    }
    
    /**
     * Find cassette by ID
     */
    findCassetteById(cassetteId) {
        for (const bin of this.bins.values()) {
            if (bin.occupied && bin.cassette && bin.cassette.id === cassetteId) {
                return {
                    binNumber: bin.binNumber,
                    cassette: bin.cassette
                };
            }
        }
        return null;
    }
    
    /**
     * Search cassettes by criteria
     */
    searchCassettes(criteria) {
        const results = [];
        
        for (const bin of this.bins.values()) {
            if (bin.occupied && bin.cassette) {
                let match = true;
                
                if (criteria.title && !bin.cassette.title.toLowerCase().includes(criteria.title.toLowerCase())) {
                    match = false;
                }
                if (criteria.artist && !bin.cassette.artist.toLowerCase().includes(criteria.artist.toLowerCase())) {
                    match = false;
                }
                if (criteria.category && bin.cassette.category !== criteria.category) {
                    match = false;
                }
                if (criteria.type && bin.cassette.type !== criteria.type) {
                    match = false;
                }
                
                if (match) {
                    results.push({
                        binNumber: bin.binNumber,
                        cassette: bin.cassette
                    });
                }
            }
        }
        
        return results;
    }
    
    /**
     * Update inventory from FlexiCart response
     */
    updateFromInventoryResponse(responseData) {
        this.lastInventoryUpdate = new Date().toISOString();
        
        // Parse inventory response and update bin occupancy
        // This would be implemented based on the actual FlexiCart inventory response format
        if (responseData && responseData.bins) {
            for (const binData of responseData.bins) {
                if (binData.occupied) {
                    this.setCassette(binData.binNumber, binData.cassette || {});
                } else {
                    this.removeCassette(binData.binNumber);
                }
            }
        }
    }
    
    /**
     * Export inventory to JSON
     */
    exportInventory() {
        return {
            metadata: {
                maxBins: this.maxBins,
                lastUpdated: this.lastInventoryUpdate,
                version: this.inventoryVersion,
                stats: this.getOccupancyStats()
            },
            bins: this.getOccupiedBins()
        };
    }
    
    /**
     * Import inventory from JSON
     */
    importInventory(inventoryData) {
        if (inventoryData.metadata && inventoryData.bins) {
            // Clear current inventory
            for (let i = 1; i <= this.maxBins; i++) {
                this.removeCassette(i);
            }
            
            // Import cassettes
            for (const binData of inventoryData.bins) {
                this.setCassette(binData.binNumber, binData.cassette);
            }
            
            this.lastInventoryUpdate = inventoryData.metadata.lastUpdated;
        }
    }
}

/**
 * Complete FlexiCart State Manager
 * Combines all data structures for comprehensive state management
 */
class FlexiCartStateManager {
    constructor(cartId = 'FC01', maxPositions = 360) {
        this.systemStatus = new FlexiCartSystemStatus(cartId, maxPositions);
        this.operations = new FlexiCartOperations();
        this.inventory = new CassetteBinOccupancy(maxPositions);
        
        // Event handling
        this.eventHandlers = new Map();
        
        // Auto-cleanup timer
        this.cleanupTimer = setInterval(() => {
            this.operations.cleanup();
            this.operations.checkTimeouts();
        }, 60000); // Every minute
    }
    
    /**
     * Update state from FlexiCart response
     */
    updateFromResponse(responseType, responseData) {
        switch (responseType) {
            case 'status':
                this.systemStatus.updateFromResponse(responseData);
                this.emit('statusUpdate', this.systemStatus);
                break;
                
            case 'inventory':
                this.inventory.updateFromInventoryResponse(responseData);
                this.emit('inventoryUpdate', this.inventory.getOccupancyStats());
                break;
                
            case 'operation_complete':
                if (responseData.operationId) {
                    this.operations.updateOperation(responseData.operationId, {
                        status: 'completed',
                        result: responseData.result
                    });
                    this.emit('operationComplete', responseData.operationId);
                }
                break;
        }
    }
    
    /**
     * Get complete system state
     */
    getState() {
        return {
            system: this.systemStatus,
            operations: {
                active: this.operations.getActiveOperations(),
                total: this.operations.operations.size
            },
            inventory: this.inventory.getOccupancyStats(),
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Event emitter functionality
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }
    
    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }
    
    /**
     * Cleanup resources
     */
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.eventHandlers.clear();
    }
}

module.exports = {
    FlexiCartSystemStatus,
    FlexiCartOperations,
    CassetteBinOccupancy,
    FlexiCartStateManager
};
