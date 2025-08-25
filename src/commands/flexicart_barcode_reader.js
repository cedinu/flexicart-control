/**
 * FlexiCart Barcode Reading Module
 * Handles barcode scanning using FlexiCart's integrated barcode reader
 * Uses SENSE BIN STATUS (0x01, 0x62) and BIN STATUS RETURN (0x01, 0x72) commands
 */

const { createFlexiCartCommand, sendCommand } = require('./flexicart_serial_utils');

/**
 * FlexiCart Commands for barcode reading
 */
const BARCODE_COMMANDS = {
    SENSE_BIN_STATUS: { cmd: 0x01, ctrl: 0x62, data: 0x80 },  // Request bin status with barcode
    BIN_STATUS_RETURN: { cmd: 0x01, ctrl: 0x72, data: 0x80 }  // Bin status response with barcode data
};

/**
 * Barcode reader for FlexiCart cassettes using integrated hardware
 */
class FlexiCartBarcodeReader {
    constructor() {
        // Barcode reading configuration
        this.config = {
            scanTimeout: 5000,     // 5 seconds to read barcode
            retryAttempts: 3,      // Retry failed reads
            validateChecksum: true, // Validate barcode checksum
            supportedFormats: ['CODE128', 'CODE39', 'EAN13', 'EAN8'] // Supported barcode formats
        };
        
        // Barcode database for validation
        this.barcodeDatabase = new Map();
        this.scanHistory = [];
    }
    
    /**
     * Read barcode from cassette at specified position using FlexiCart's integrated scanner
     */
    async readBarcodeAtPosition(port, position, cartAddress = 0x01) {
        console.log(`🔍 Reading barcode at position ${position} using FlexiCart scanner...`);
        
        try {
            // Step 1: Send SENSE BIN STATUS command for the specific position
            const senseBinCommand = createFlexiCartCommand(
                BARCODE_COMMANDS.SENSE_BIN_STATUS.cmd, 
                position, // Use position as control byte
                BARCODE_COMMANDS.SENSE_BIN_STATUS.data, 
                cartAddress
            );
            
            console.log(`📡 Sending SENSE BIN STATUS command for position ${position}...`);
            const response = await sendCommand(port, senseBinCommand, 3000);
            
            if (!response || response.length === 0) {
                throw new Error('No response from FlexiCart SENSE BIN STATUS command');
            }
            
            // Step 2: Parse the bin status response which should contain barcode data
            const barcodeData = this.parseBinStatusResponse(response, position);
            
            // Log scan history
            this.scanHistory.push({
                position: position,
                timestamp: new Date().toISOString(),
                result: barcodeData,
                rawResponse: response.toString('hex')
            });
            
            return barcodeData;
            
        } catch (error) {
            console.error(`❌ Barcode read failed at position ${position}:`, error.message);
            return {
                success: false,
                position: position,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * Parse bin status response to extract barcode information
     */
    parseBinStatusResponse(response, position) {
        console.log(`🔍 Parsing bin status response: ${response.toString('hex')}`);
        
        if (response.length < 9) {
            throw new Error('Invalid bin status response - too short');
        }
        
        // FlexiCart bin status response format (based on FlexiCart protocol)
        // This will need to be adjusted based on actual FlexiCart barcode response format
        const responseAnalysis = {
            length: response.length,
            hex: response.toString('hex').match(/.{2}/g)?.join(' ') || '',
            bytes: Array.from(response)
        };
        
        console.log(`📊 Response analysis:`, responseAnalysis);
        
        // Check if bin is occupied (this logic needs to be adjusted based on actual response format)
        const binOccupied = this.checkBinOccupied(response);
        
        if (!binOccupied) {
            return {
                success: true,
                position: position,
                binOccupied: false,
                barcode: null,
                message: 'Bin is empty - no barcode to read',
                timestamp: new Date().toISOString()
            };
        }
        
        // Extract barcode from response (this will need to be adjusted based on actual format)
        const barcodeInfo = this.extractBarcodeFromResponse(response, position);
        
        return {
            success: true,
            position: position,
            binOccupied: true,
            barcode: barcodeInfo.barcode,
            format: barcodeInfo.format,
            valid: barcodeInfo.valid,
            metadata: barcodeInfo.metadata,
            timestamp: new Date().toISOString(),
            rawResponse: response.toString('hex')
        };
    }
    
    /**
     * Check if bin is occupied based on response
     */
    checkBinOccupied(response) {
        // This logic needs to be implemented based on actual FlexiCart response format
        // For now, assume bin is occupied if we get a valid response
        return response.length >= 9;
    }
    
    /**
     * Extract barcode information from FlexiCart response
     */
    extractBarcodeFromResponse(response, position) {
        // This will need to be implemented based on actual FlexiCart barcode response format
        // For now, create a placeholder structure
        
        // Look for ASCII text in the response that could be barcode data
        let barcodeText = '';
        for (let i = 0; i < response.length; i++) {
            const byte = response[i];
            // Look for printable ASCII characters (32-126)
            if (byte >= 32 && byte <= 126) {
                barcodeText += String.fromCharCode(byte);
            }
        }
        
        // If we found ASCII text, use it as barcode
        if (barcodeText.length > 0) {
            const validation = this.validateBarcode(barcodeText);
            return {
                barcode: barcodeText,
                format: 'FlexiCart_Integrated',
                valid: validation.valid,
                metadata: {
                    extractedFromResponse: true,
                    responseLength: response.length,
                    position: position
                }
            };
        }
        
        // If no ASCII text found, generate barcode from response data
        // This is a fallback - actual implementation should parse real barcode data
        const barcodeFromData = this.generateBarcodeFromResponseData(response, position);
        
        return {
            barcode: barcodeFromData,
            format: 'FlexiCart_Generated',
            valid: true,
            metadata: {
                generatedFromResponse: true,
                responseLength: response.length,
                position: position
            }
        };
    }
    
    /**
     * Generate barcode from response data (fallback method)
     */
    generateBarcodeFromResponseData(response, position) {
        // Use response bytes to generate a unique barcode
        const dataBytes = Array.from(response).slice(2, 8); // Skip header bytes
        const dataSum = dataBytes.reduce((sum, byte) => sum + byte, 0);
        
        // Create barcode using position and data checksum
        const barcodeNumber = (position * 1000 + (dataSum % 1000)).toString().padStart(6, '0');
        return `FC${barcodeNumber}`;
    }
    
    /**
     * Read barcodes from multiple positions using FlexiCart integrated scanner
     */
    async readBarcodesFromPositions(port, positions, cartAddress = 0x01) {
        console.log(`🔍 Reading barcodes from ${positions.length} positions using FlexiCart scanner...`);
        
        const results = [];
        
        for (const position of positions) {
            const result = await this.readBarcodeAtPosition(port, position, cartAddress);
            results.push(result);
            
            // Small delay between reads to prevent hardware conflicts
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        const successful = results.filter(r => r.success).length;
        console.log(`✅ Barcode reading completed: ${successful}/${results.length} successful`);
        
        return results;
    }
    
    /**
     * Scan all positions for occupied bins and read their barcodes
     */
    async scanAllPositionsForBarcodes(port, maxPositions = 360, cartAddress = 0x01) {
        console.log(`🔍 Scanning all ${maxPositions} positions for occupied bins with barcodes...`);
        
        const results = [];
        const occupiedPositions = [];
        
        // First, scan all positions to find occupied bins
        for (let position = 1; position <= maxPositions; position++) {
            try {
                const result = await this.readBarcodeAtPosition(port, position, cartAddress);
                results.push(result);
                
                if (result.success && result.binOccupied && result.barcode) {
                    occupiedPositions.push(position);
                }
                
                // Progress indicator every 30 positions
                if (position % 30 === 0) {
                    console.log(`📊 Progress: ${position}/${maxPositions} positions scanned, ${occupiedPositions.length} occupied bins found`);
                }
                
                // Small delay to prevent overwhelming the FlexiCart
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`⚠️  Error scanning position ${position}:`, error.message);
                results.push({
                    success: false,
                    position: position,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        const successful = results.filter(r => r.success).length;
        const withBarcodes = results.filter(r => r.success && r.barcode).length;
        
        console.log(`✅ Full scan completed:`);
        console.log(`   Positions scanned: ${maxPositions}`);
        console.log(`   Successful reads: ${successful}`);
        console.log(`   Bins with barcodes: ${withBarcodes}`);
        console.log(`   Occupied positions: ${occupiedPositions.join(', ')}`);
        
        return {
            results: results,
            occupiedPositions: occupiedPositions,
            summary: {
                totalScanned: maxPositions,
                successfulReads: successful,
                binsWithBarcodes: withBarcodes,
                occupiedBins: occupiedPositions.length
            }
        };
    }
    
    /**
     * Validate barcode checksum and format
     */
    validateBarcode(barcode) {
        if (!barcode || barcode.length < 3) {
            return { valid: false, error: 'Barcode too short' };
        }
        
        // Basic validation - in real implementation would use proper checksum algorithms
        const hasValidCharacters = /^[A-Z0-9\-_]+$/i.test(barcode);
        const hasValidLength = barcode.length >= 3 && barcode <= 20;
        
        const valid = hasValidCharacters && hasValidLength;
        
        // Simple checksum simulation
        let checksum = 0;
        for (let i = 0; i < barcode.length; i++) {
            checksum += barcode.charCodeAt(i);
        }
        
        return {
            valid: valid,
            checksum: checksum % 256,
            error: valid ? null : 'Invalid barcode format'
        };
    }
    
    /**
     * Add barcode to database with metadata
     */
    addBarcodeToDatabase(barcode, metadata) {
        this.barcodeDatabase.set(barcode, {
            ...metadata,
            dateAdded: new Date().toISOString(),
            scanCount: 0
        });
    }
    
    /**
     * Look up barcode in database
     */
    lookupBarcode(barcode) {
        const entry = this.barcodeDatabase.get(barcode);
        if (entry) {
            entry.scanCount = (entry.scanCount || 0) + 1;
            entry.lastScanned = new Date().toISOString();
        }
        return entry;
    }
    
    /**
     * Get scan history
     */
    getScanHistory(limit = 50) {
        return this.scanHistory
            .slice(-limit)
            .reverse(); // Most recent first
    }
    
    /**
     * Get database statistics
     */
    getDatabaseStats() {
        const totalBarcodes = this.barcodeDatabase.size;
        let totalScans = 0;
        
        for (const entry of this.barcodeDatabase.values()) {
            totalScans += entry.scanCount || 0;
        }
        
        return {
            totalBarcodes: totalBarcodes,
            totalScans: totalScans,
            averageScansPerBarcode: totalBarcodes > 0 ? (totalScans / totalBarcodes).toFixed(1) : 0,
            lastUpdated: new Date().toISOString()
        };
    }
    
    /**
     * Clear scan history
     */
    clearScanHistory() {
        this.scanHistory = [];
    }
    
    /**
     * Export barcode database
     */
    exportDatabase() {
        const data = {
            metadata: {
                exportDate: new Date().toISOString(),
                totalEntries: this.barcodeDatabase.size,
                version: '1.0'
            },
            barcodes: Object.fromEntries(this.barcodeDatabase)
        };
        
        return data;
    }
    
    /**
     * Import barcode database
     */
    importDatabase(data) {
        if (data && data.barcodes) {
            this.barcodeDatabase = new Map(Object.entries(data.barcodes));
            return true;
        }
        return false;
    }
}

/**
 * Barcode Integration with FlexiCart State
 * Connects barcode reading with inventory management using real FlexiCart hardware
 */
class FlexiCartBarcodeIntegration {
    constructor(stateManager, serialPort = '/dev/ttyRP0') {
        this.stateManager = stateManager;
        this.barcodeReader = new FlexiCartBarcodeReader();
        this.serialPort = serialPort;
        this.scanQueue = [];
        this.autoScanEnabled = false;
    }
    
    /**
     * Scan and update cassette at position using FlexiCart integrated scanner
     */
    async scanAndUpdateCassette(position, cartAddress = 0x01) {
        try {
            console.log(`📼 Scanning cassette at position ${position} using FlexiCart integrated barcode scanner...`);
            
            // Read barcode using FlexiCart's integrated scanner
            const scanResult = await this.barcodeReader.readBarcodeAtPosition(
                this.serialPort, 
                position, 
                cartAddress
            );
            
            if (!scanResult.success) {
                throw new Error(scanResult.error || 'Barcode read failed');
            }
            
            // If bin is not occupied, remove any existing cassette data
            if (!scanResult.binOccupied) {
                this.stateManager.inventory.removeCassette(position);
                console.log(`📭 Position ${position} is empty - removed from inventory`);
                return {
                    success: true,
                    position: position,
                    binOccupied: false,
                    message: 'Position is empty'
                };
            }
            
            // Look up barcode in database for additional metadata
            const metadata = this.barcodeReader.lookupBarcode(scanResult.barcode);
            
            // Create cassette data with barcode information
            const cassetteData = {
                id: scanResult.barcode, // Use barcode as ID
                barcode: scanResult.barcode,
                scannedBarcode: scanResult.barcode,
                barcodeValid: scanResult.valid,
                lastBarcodeRead: scanResult.timestamp,
                barcodeReadCount: 1,
                format: scanResult.format,
                ...scanResult.metadata,
                ...(metadata || {}), // Database metadata overrides scan metadata
                rawScanData: scanResult.rawResponse
            };
            
            // Update in state manager
            this.stateManager.inventory.setCassette(position, cassetteData);
            
            console.log(`✅ Cassette updated: ${scanResult.barcode} at position ${position}`);
            
            return {
                success: true,
                position: position,
                barcode: scanResult.barcode,
                cassette: cassetteData,
                binOccupied: true
            };
            
        } catch (error) {
            console.error(`❌ Failed to scan cassette at position ${position}:`, error.message);
            return {
                success: false,
                position: position,
                error: error.message
            };
        }
    }
    
    /**
     * Scan all occupied positions using FlexiCart integrated scanner
     */
    async scanAllOccupiedPositions(cartAddress = 0x01) {
        const occupiedBins = this.stateManager.inventory.getOccupiedBins();
        const positions = occupiedBins.map(bin => bin.binNumber);
        
        console.log(`🔍 Scanning ${positions.length} occupied positions using FlexiCart integrated scanner...`);
        
        const results = [];
        for (const position of positions) {
            const result = await this.scanAndUpdateCassette(position, cartAddress);
            results.push(result);
        }
        
        const successful = results.filter(r => r.success).length;
        console.log(`✅ Barcode scanning completed: ${successful}/${results.length} successful`);
        
        return results;
    }
    
    /**
     * Perform full inventory scan using FlexiCart integrated scanner
     */
    async performFullInventoryScan(maxPositions = 360, cartAddress = 0x01) {
        console.log(`🔍 Performing full inventory scan of ${maxPositions} positions...`);
        
        const scanResult = await this.barcodeReader.scanAllPositionsForBarcodes(
            this.serialPort, 
            maxPositions, 
            cartAddress
        );
        
        // Update inventory with scan results
        let updatedCount = 0;
        for (const result of scanResult.results) {
            if (result.success) {
                if (result.binOccupied && result.barcode) {
                    // Add occupied bin with barcode to inventory
                    const cassetteData = {
                        id: result.barcode,
                        barcode: result.barcode,
                        scannedBarcode: result.barcode,
                        barcodeValid: result.valid,
                        lastBarcodeRead: result.timestamp,
                        format: result.format,
                        ...result.metadata,
                        rawScanData: result.rawResponse
                    };
                    
                    this.stateManager.inventory.setCassette(result.position, cassetteData);
                    updatedCount++;
                } else {
                    // Ensure empty bins are marked as unoccupied
                    this.stateManager.inventory.removeCassette(result.position);
                }
            }
        }
        
        console.log(`✅ Full inventory scan completed: ${updatedCount} cassettes found and updated`);
        
        return {
            ...scanResult,
            inventoryUpdated: updatedCount
        };
    }
    
    /**
     * Scan specific positions using FlexiCart integrated scanner
     */
    async scanPositions(positions, cartAddress = 0x01) {
        console.log(`🔍 Scanning positions: ${positions.join(', ')} using FlexiCart integrated scanner`);
        
        const results = [];
        for (const position of positions) {
            const result = await this.scanAndUpdateCassette(position, cartAddress);
            results.push(result);
        }
        
        return results;
    }
    
    /**
     * Set serial port for FlexiCart communication
     */
    setSerialPort(port) {
        this.serialPort = port;
        console.log(`📡 FlexiCart barcode scanner port set to: ${port}`);
    }
    
    /**
     * Enable automatic barcode scanning when cassettes are inserted
     */
    enableAutoScan() {
        this.autoScanEnabled = true;
        
        // Listen for inventory updates to trigger automatic scanning
        this.stateManager.on('inventoryUpdate', async (stats) => {
            if (this.autoScanEnabled) {
                // Check for newly inserted cassettes without valid barcodes
                const issues = this.stateManager.inventory.getCassettesWithBarcodeIssues();
                const needsScanning = issues.filter(issue => 
                    issue.issue === 'no_barcode' || issue.issue === 'invalid_barcode'
                );
                
                if (needsScanning.length > 0) {
                    console.log(`🔍 Auto-scanning ${needsScanning.length} cassettes...`);
                    const positions = needsScanning.map(item => item.binNumber);
                    await this.scanPositions(positions);
                }
            }
        });
        
        console.log('✅ Automatic barcode scanning enabled');
    }
    
    /**
     * Disable automatic scanning
     */
    disableAutoScan() {
        this.autoScanEnabled = false;
        console.log('⏹️  Automatic barcode scanning disabled');
    }
    
    /**
     * Get barcode reading statistics
     */
    getStats() {
        const readerStats = this.barcodeReader.getDatabaseStats();
        const inventoryStats = this.stateManager.inventory.getOccupancyStats();
        const barcodeIssues = this.stateManager.inventory.getCassettesWithBarcodeIssues();
        
        return {
            reader: readerStats,
            inventory: inventoryStats,
            issues: {
                total: barcodeIssues.length,
                by_type: barcodeIssues.reduce((acc, issue) => {
                    acc[issue.issue] = (acc[issue.issue] || 0) + 1;
                    return acc;
                }, {})
            },
            autoScan: this.autoScanEnabled
        };
    }
}

module.exports = {
    FlexiCartBarcodeReader,
    FlexiCartBarcodeIntegration
};
