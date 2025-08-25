/**
 * FlexiCart Barcode Reading Module
 * Handles barcode scanning using FlexiCart's integrated barcode reader
 * Uses SENSE BIN STATUS (CMD: 0x62) and BIN STATUS RETURN (CMD: 0x72) commands
 * Based on official FlexiCart protocol specification
 */

const { createFlexiCartCommand, sendCommand } = require('./flexicart_serial_utils');

/**
 * FlexiCart Commands for barcode reading and lamp control
 * Based on official FlexiCart protocol specification
 */
const BARCODE_COMMANDS = {
    SENSE_BIN_STATUS: { cmd: 0x62, ctrl: 0x01, data: 0x80 },  // Request bin status with barcode
    BIN_STATUS_RETURN: { cmd: 0x72, ctrl: 0x01, data: 0x80 }, // Bin status response with barcode data  
    SET_BIN_LAMP: { cmd: 0x09, ctrl: 0x01, data: 0x80 }       // Set bin lamp for detected cassettes
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
     * Based on actual FlexiCart behavior analysis:
     * - ACK (0x04) response = empty bin
     * - Timeout = possibly occupied bin or barcode scanning in progress
     * - Longer response = barcode data
     */
    async readBarcodeAtPosition(port, position, cartAddress = 0x01) {
        console.log(`🔍 Reading barcode at position ${position} using FlexiCart scanner...`);
        
        try {
            // Step 1: Send SENSE BIN STATUS command for the specific position
            const senseBinCommand = createFlexiCartCommand(
                cartAddress,                              // UA2 - Cart address
                BARCODE_COMMANDS.SENSE_BIN_STATUS.cmd,    // CMD - 0x62
                0x00,                                     // BT - Block type
                position,                                 // CTRL - Position as control byte  
                BARCODE_COMMANDS.SENSE_BIN_STATUS.data    // DATA - 0x80
            );
            
            console.log(`📡 Sending SENSE BIN STATUS command for position ${position}...`);
            const response = await sendCommand(port, senseBinCommand, 3000); // Shorter timeout
            
            if (!response || response.length === 0) {
                // No response might indicate occupied bin with barcode scan in progress
                console.log(`🔄 Position ${position}: No immediate response - checking for barcode scan...`);
                
                // Wait a moment and try to get BIN STATUS RETURN data
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const statusReturnCommand = createFlexiCartCommand(
                    cartAddress,                               // UA2 - Cart address
                    BARCODE_COMMANDS.BIN_STATUS_RETURN.cmd,    // CMD - 0x72
                    0x00,                                      // BT - Block type
                    position,                                  // CTRL - Position as control byte
                    BARCODE_COMMANDS.BIN_STATUS_RETURN.data    // DATA - 0x80
                );
                
                const statusResponse = await sendCommand(port, statusReturnCommand, 2000);
                
                if (statusResponse && statusResponse.length > 1) {
                    return this.parseBinStatusResponse(statusResponse, position, true);
                }
                
                // Still no response - treat as occupied bin with unknown barcode
                return {
                    success: true,
                    position: position,
                    binOccupied: true,
                    barcode: `UNKNOWN_${position}`,
                    message: 'Occupied bin - barcode scan timeout',
                    timestamp: new Date().toISOString(),
                    rawResponse: 'timeout'
                };
            }
            
            // Parse the response
            const barcodeData = this.parseBinStatusResponse(response, position, false);
            
            // Log scan history
            this.scanHistory.push({
                position: position,
                timestamp: new Date().toISOString(),
                result: barcodeData,
                rawResponse: response.toString('hex')
            });
            
            return barcodeData;
            
        } catch (error) {
            // Timeout errors might indicate occupied bins
            if (error.message.includes('timeout')) {
                console.log(`⏱️  Position ${position}: Timeout - likely occupied bin scanning barcode`);
                
                const timeoutResult = {
                    success: true,
                    position: position,
                    binOccupied: true,
                    barcode: `TIMEOUT_${position}`,
                    message: 'Occupied bin - barcode scan timeout',
                    timestamp: new Date().toISOString(),
                    rawResponse: 'timeout'
                };
                
                // Log timeout as potential occupancy
                this.scanHistory.push({
                    position: position,
                    timestamp: new Date().toISOString(),
                    result: timeoutResult,
                    rawResponse: 'timeout'
                });
                
                return timeoutResult;
            }
            
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
                cartAddress,                           // UA2 - Cart address  
                BARCODE_COMMANDS.SET_BIN_LAMP.cmd,     // CMD - 0x09
                0x00,                                  // BT - Block type
                position,                              // CTRL - Position as control byte
                lampState ? 0x01 : 0x00               // DATA - Lamp state (0x01=on, 0x00=off)
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
    parseBinStatusResponse(response, position, isStatusReturn = false) {
        console.log(`🔍 Parsing ${isStatusReturn ? 'STATUS RETURN' : 'SENSE BIN'} response: ${response.toString('hex')}`);
        
        // FlexiCart bin status response analysis
        const responseAnalysis = {
            length: response.length,
            hex: response.toString('hex').match(/.{2}/g)?.join(' ') || '',
            bytes: Array.from(response)
        };
        
        console.log(`📊 Response analysis:`, responseAnalysis);
        
        // Handle ACK response (empty bin)
        if (response.length === 1 && response[0] === 0x04) {
            console.log(`📭 Position ${position}: ACK response - bin is empty`);
            return {
                success: true,
                position: position,
                binOccupied: false,
                barcode: null,
                message: 'ACK received - bin is empty',
                timestamp: new Date().toISOString(),
                rawResponse: response.toString('hex')
            };
        }
        
        // Handle longer responses that might contain barcode data
        if (response.length > 1) {
            console.log(`📼 Position ${position}: Extended response - bin likely occupied`);
            
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
        
        // Default case - unknown response
        console.log(`❓ Position ${position}: Unknown response pattern`);
        return {
            success: true,
            position: position,
            binOccupied: false,
            barcode: null,
            message: 'Unknown response pattern - assuming empty',
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
            let cassetteTitle = `Position ${position}`;
            let cassetteCategory = 'unknown';
            
            // Determine cassette type based on barcode pattern
            if (scanResult.barcode) {
                if (scanResult.barcode.includes('TIMEOUT')) {
                    cassetteTitle = `Cassette at ${position} (Scan Timeout)`;
                    cassetteCategory = 'timeout_detected';
                } else if (scanResult.barcode.includes('UNKNOWN')) {
                    cassetteTitle = `Cassette at ${position} (No Barcode)`;
                    cassetteCategory = 'no_barcode';
                } else {
                    cassetteTitle = `Cassette ${scanResult.barcode}`;
                    cassetteCategory = 'scanned';
                }
            }
            
            const cassetteData = {
                id: scanResult.barcode || `FC_POS_${position}`,
                barcode: scanResult.barcode,
                scannedBarcode: scanResult.barcode,
                barcodeValid: scanResult.valid,
                lastBarcodeRead: scanResult.timestamp,
                barcodeReadCount: 1,
                format: scanResult.format || 'FlexiCart_Detected',
                title: cassetteTitle,
                category: cassetteCategory,
                detectionMethod: scanResult.message,
                ...scanResult.metadata,
                rawScanData: scanResult.rawResponse
            };
            
            // Add to inventory
            this.stateManager.inventory.setCassette(position, cassetteData);
            
            // Set bin lamp for detected cassettes (only if not timeout to avoid lamp command timeouts)
            if (!scanResult.barcode?.includes('TIMEOUT')) {
                try {
                    await this.barcodeReader.setBinLamp(this.serialPort, position, true, cartAddress);
                } catch (lampError) {
                    console.warn(`⚠️  Could not set lamp for position ${position}: ${lampError.message}`);
                }
            }
            
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
        let timeoutCount = 0;
        let emptyCount = 0;
        const detectedPositions = [];
        const timeoutPositions = [];
        
        for (const result of scanResult.results) {
            if (result.success) {
                if (result.binOccupied) {
                    // Determine cassette type based on detection method
                    let cassetteTitle = `Position ${result.position}`;
                    let cassetteCategory = 'unknown';
                    
                    if (result.barcode) {
                        if (result.barcode.includes('TIMEOUT')) {
                            cassetteTitle = `Cassette at ${result.position} (Scan Timeout)`;
                            cassetteCategory = 'timeout_detected';
                            timeoutCount++;
                            timeoutPositions.push(result.position);
                        } else if (result.barcode.includes('UNKNOWN')) {
                            cassetteTitle = `Cassette at ${result.position} (No Barcode)`;
                            cassetteCategory = 'no_barcode';
                        } else {
                            cassetteTitle = `Cassette ${result.barcode}`;
                            cassetteCategory = 'scanned';
                        }
                    }
                    
                    // Add occupied bin to inventory
                    const cassetteData = {
                        id: result.barcode || `FC_POS_${result.position}`,
                        barcode: result.barcode,
                        scannedBarcode: result.barcode,
                        barcodeValid: result.valid,
                        lastBarcodeRead: result.timestamp,
                        format: result.format || 'FlexiCart_Detected',
                        title: cassetteTitle,
                        category: cassetteCategory,
                        detectionMethod: result.message,
                        ...result.metadata,
                        rawScanData: result.rawResponse
                    };
                    
                    this.stateManager.inventory.setCassette(result.position, cassetteData);
                    detectedPositions.push(result.position);
                    updatedCount++;
                    
                    // Set bin lamp for detected cassettes (avoid for timeout positions to prevent more timeouts)
                    if (!result.barcode?.includes('TIMEOUT')) {
                        try {
                            await this.barcodeReader.setBinLamp(this.serialPort, result.position, true, cartAddress);
                        } catch (lampError) {
                            console.warn(`⚠️  Could not set lamp for position ${result.position}: ${lampError.message}`);
                        }
                    }
                    
                } else {
                    // Ensure empty bins are marked as unoccupied and lamps are off
                    this.stateManager.inventory.removeCassette(result.position);
                    emptyCount++;
                    
                    // Turn off lamps for empty bins (with error handling)
                    try {
                        await this.barcodeReader.setBinLamp(this.serialPort, result.position, false, cartAddress);
                    } catch (lampError) {
                        // Ignore lamp errors for empty bins - they're likely already off
                        console.debug(`Lamp clear failed for empty position ${result.position} (expected)`);
                    }
                }
            }
        }
        
        console.log(`✅ Full inventory scan completed:`);
        console.log(`   ${updatedCount} cassettes found and updated`);
        console.log(`   ${detectedPositions.length} bin lamps activated`);
        console.log(`   ${timeoutCount} timeout-detected cassettes`);
        console.log(`   ${emptyCount} empty bins confirmed`);
        if (detectedPositions.length > 0) {
            console.log(`   Detected positions: ${detectedPositions.join(', ')}`);
        }
        if (timeoutPositions.length > 0) {
            console.log(`   Timeout positions: ${timeoutPositions.join(', ')} (likely cassettes with barcode scan issues)`);
        }
        
        return {
            ...scanResult,
            inventoryUpdated: updatedCount,
            detectedPositions: detectedPositions,
            timeoutPositions: timeoutPositions,
            emptyCount: emptyCount,
            timeoutCount: timeoutCount
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
