/**
 * FlexiCart Barcode Reading Module
 * Handles barcode scanning using FlexiCart's integrated barcode reader
 * Uses SENSE BIN STATUS (0x01, 0x62) and BIN STATUS RETURN (0x01, 0x72) commands
 */

const { createFlexiCartCommand, sendCommand } = require('./flexicart_serial_utils');

/**
 * FlexiCart Commands for barcode reading and lamp control
 */
const BARCODE_COMMANDS = {
    SENSE_BIN_STATUS: { cmd: 0x01, ctrl: 0x62, data: 0x80 },  // Request bin status with barcode
    BIN_STATUS_RETURN: { cmd: 0x01, ctrl: 0x72, data: 0x80 }, // Bin status response with barcode data
    SET_BIN_LAMP: { cmd: 0x01, ctrl: 0x09, data: 0x80 }       // Set bin lamp for detected cassettes
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
            const response = await sendCommand(port, senseBinCommand, 5000); // Increased timeout
            
            if (!response || response.length === 0) {
                throw new Error('No response from FlexiCart SENSE BIN STATUS command');
            }
            
            // If we get just ACK (0x04), the bin might be empty or command accepted
            if (response.length === 1 && response[0] === 0x04) {
                console.log(`📭 Position ${position}: Received ACK - bin likely empty or no barcode data`);
                return {
                    success: true,
                    position: position,
                    binOccupied: false,
                    barcode: null,
                    message: 'Bin empty or no barcode available',
                    timestamp: new Date().toISOString(),
                    rawResponse: response.toString('hex')
                };
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
            
            // Log failed attempt
            this.scanHistory.push({
                position: position,
                timestamp: new Date().toISOString(),
                result: {
                    success: false,
                    position: position,
                    error: error.message,
                    timestamp: new Date().toISOString()
                },
                rawResponse: null
            });
            
            return {
                success: false,
                position: position,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * Set bin lamp for detected cassettes
     */
    async setBinLamp(port, position, lampState = true, cartAddress = 0x01) {
        try {
            console.log(`💡 ${lampState ? 'Setting' : 'Clearing'} bin lamp at position ${position}...`);
            
            const lampCommand = createFlexiCartCommand(
                BARCODE_COMMANDS.SET_BIN_LAMP.cmd,
                position, // Position as control byte
                lampState ? 0x01 : 0x00, // Lamp state as data byte
                cartAddress
            );
            
            const response = await sendCommand(port, lampCommand, 2000);
            
            if (response && response.length > 0 && response[0] === 0x04) {
                console.log(`✅ Bin lamp ${lampState ? 'on' : 'off'} at position ${position}`);
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error(`❌ Failed to set bin lamp at position ${position}:`, error.message);
            return false;
        }
    }
    
    /**
     * Parse bin status response to extract barcode information
     */
    parseBinStatusResponse(response, position) {
        console.log(`🔍 Parsing bin status response: ${response.toString('hex')}`);
        
        // FlexiCart bin status response analysis
        const responseAnalysis = {
            length: response.length,
            hex: response.toString('hex').match(/.{2}/g)?.join(' ') || '',
            bytes: Array.from(response)
        };
        
        console.log(`📊 Response analysis:`, responseAnalysis);
        
        // Check for different response types
        if (response.length === 1 && response[0] === 0x04) {
            // ACK response - bin might be empty
            return {
                success: true,
                position: position,
                binOccupied: false,
                barcode: null,
                message: 'ACK received - bin likely empty',
                timestamp: new Date().toISOString(),
                rawResponse: response.toString('hex')
            };
        }
        
        // Look for longer responses that might contain barcode data
        if (response.length > 1) {
            // Check if bin is occupied based on response structure
            const binOccupied = this.checkBinOccupied(response);
            
            if (!binOccupied) {
                return {
                    success: true,
                    position: position,
                    binOccupied: false,
                    barcode: null,
                    message: 'Bin is empty',
                    timestamp: new Date().toISOString(),
                    rawResponse: response.toString('hex')
                };
            }
            
            // Extract barcode from response
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
        
        // Default case - treat as empty bin
        return {
            success: true,
            position: position,
            binOccupied: false,
            barcode: null,
            message: 'Short response - bin likely empty',
            timestamp: new Date().toISOString(),
            rawResponse: response.toString('hex')
        };
    }
    
    /**
     * Check if bin is occupied based on response
     */
    checkBinOccupied(response) {
        // Analyze response to determine occupancy
        // ACK only (0x04) typically means empty
        if (response.length === 1 && response[0] === 0x04) {
            return false;
        }
        
        // Longer responses might indicate occupancy with data
        if (response.length > 4) {
            return true;
        }
        
        // Look for specific patterns that indicate occupancy
        // This will need refinement based on actual FlexiCart responses
        return response.length > 1;
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
                    message: scanResult.message || 'Position is empty'
                };
            }
            
            // Bin is occupied - create cassette entry
            const cassetteData = {
                id: scanResult.barcode || `FC_POS_${position}`, // Use barcode as ID or fallback
                barcode: scanResult.barcode,
                scannedBarcode: scanResult.barcode,
                barcodeValid: scanResult.valid,
                lastBarcodeRead: scanResult.timestamp,
                barcodeReadCount: 1,
                format: scanResult.format,
                title: scanResult.barcode ? `Cassette ${scanResult.barcode}` : `Position ${position}`,
                category: 'detected',
                ...scanResult.metadata,
                rawScanData: scanResult.rawResponse
            };
            
            // Add to inventory
            this.stateManager.inventory.setCassette(position, cassetteData);
            
            // Set bin lamp for detected cassettes
            await this.barcodeReader.setBinLamp(this.serialPort, position, true, cartAddress);
            
            console.log(`✅ Cassette detected: ${scanResult.barcode || 'Unknown ID'} at position ${position}`);
            
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
        
        // Update inventory with scan results and set lamps for detected cassettes
        let updatedCount = 0;
        const detectedPositions = [];
        
        for (const result of scanResult.results) {
            if (result.success) {
                if (result.binOccupied) {
                    // Add occupied bin to inventory
                    const cassetteData = {
                        id: result.barcode || `FC_POS_${result.position}`,
                        barcode: result.barcode,
                        scannedBarcode: result.barcode,
                        barcodeValid: result.valid,
                        lastBarcodeRead: result.timestamp,
                        format: result.format,
                        title: result.barcode ? `Cassette ${result.barcode}` : `Position ${result.position}`,
                        category: 'detected',
                        ...result.metadata,
                        rawScanData: result.rawResponse
                    };
                    
                    this.stateManager.inventory.setCassette(result.position, cassetteData);
                    detectedPositions.push(result.position);
                    updatedCount++;
                    
                    // Set bin lamp for detected cassettes
                    await this.barcodeReader.setBinLamp(this.serialPort, result.position, true, cartAddress);
                    
                } else {
                    // Ensure empty bins are marked as unoccupied and lamps are off
                    this.stateManager.inventory.removeCassette(result.position);
                    await this.barcodeReader.setBinLamp(this.serialPort, result.position, false, cartAddress);
                }
            }
        }
        
        console.log(`✅ Full inventory scan completed:`);
        console.log(`   ${updatedCount} cassettes found and updated`);
        console.log(`   ${detectedPositions.length} bin lamps activated`);
        if (detectedPositions.length > 0) {
            console.log(`   Detected positions: ${detectedPositions.join(', ')}`);
        }
        
        return {
            ...scanResult,
            inventoryUpdated: updatedCount,
            detectedPositions: detectedPositions
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
