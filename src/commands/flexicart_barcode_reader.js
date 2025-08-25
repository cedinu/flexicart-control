/**
 * FlexiCart Barcode Reading Module
 * Handles barcode scanning and validation for FlexiCart cassettes
 */

/**
 * Barcode reader for FlexiCart cassettes
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
     * Read barcode from cassette at specified position
     * This would interface with actual barcode scanning hardware
     */
    async readBarcodeAtPosition(position, cartAddress = 0x01) {
        console.log(`🔍 Reading barcode at position ${position}...`);
        
        try {
            // Simulate barcode reading process
            // In real implementation, this would:
            // 1. Move to position if needed
            // 2. Activate barcode scanner
            // 3. Read and validate barcode
            // 4. Return results
            
            const scanResult = await this.simulateBarcodeRead(position);
            
            // Log scan history
            this.scanHistory.push({
                position: position,
                timestamp: new Date().toISOString(),
                result: scanResult
            });
            
            return scanResult;
            
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
     * Read barcodes from multiple positions
     */
    async readBarcodesFromPositions(positions, cartAddress = 0x01) {
        console.log(`🔍 Reading barcodes from ${positions.length} positions...`);
        
        const results = [];
        
        for (const position of positions) {
            const result = await this.readBarcodeAtPosition(position, cartAddress);
            results.push(result);
            
            // Small delay between reads to prevent hardware conflicts
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        const successful = results.filter(r => r.success).length;
        console.log(`✅ Barcode reading completed: ${successful}/${results.length} successful`);
        
        return results;
    }
    
    /**
     * Simulate barcode reading (replace with actual hardware interface)
     */
    async simulateBarcodeRead(position) {
        // Simulate reading delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Generate realistic barcode data based on position
        const barcodeData = this.generateRealisticBarcode(position);
        
        // Simulate occasional read failures
        const readSuccess = Math.random() > 0.1; // 90% success rate
        
        if (!readSuccess) {
            throw new Error('Barcode scan failed - no readable code detected');
        }
        
        // Validate barcode
        const validation = this.validateBarcode(barcodeData.barcode);
        
        return {
            success: true,
            position: position,
            barcode: barcodeData.barcode,
            format: barcodeData.format,
            valid: validation.valid,
            checksum: validation.checksum,
            metadata: barcodeData.metadata,
            timestamp: new Date().toISOString(),
            readTimeMs: 450 + Math.random() * 100 // Realistic read time
        };
    }
    
    /**
     * Generate realistic barcode for testing
     */
    generateRealisticBarcode(position) {
        // Realistic broadcast cassette barcode patterns
        const prefixes = ['BC', 'CART', 'AD', 'MUS', 'NEWS', 'SFX'];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const number = position.toString().padStart(4, '0');
        const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // Random letter
        
        const barcode = `${prefix}${number}${suffix}`;
        
        // Generate metadata based on barcode prefix
        const metadata = this.generateMetadataFromBarcode(prefix, position);
        
        return {
            barcode: barcode,
            format: 'CODE128',
            metadata: metadata
        };
    }
    
    /**
     * Generate metadata from barcode patterns
     */
    generateMetadataFromBarcode(prefix, position) {
        const metadataTemplates = {
            'BC': {
                category: 'commercial',
                type: 'advertisement',
                duration: '00:00:30'
            },
            'CART': {
                category: 'general',
                type: 'cart',
                duration: '00:03:00'
            },
            'AD': {
                category: 'commercial',
                type: 'advertisement',
                duration: '00:00:60'
            },
            'MUS': {
                category: 'music',
                type: 'background',
                duration: '00:04:30'
            },
            'NEWS': {
                category: 'news',
                type: 'bulletin',
                duration: '00:02:00'
            },
            'SFX': {
                category: 'effects',
                type: 'sound_effect',
                duration: '00:00:10'
            }
        };
        
        const template = metadataTemplates[prefix] || metadataTemplates['CART'];
        
        return {
            ...template,
            title: `${prefix} Content ${position}`,
            artist: 'FlexiCart System',
            position: position
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
        const hasValidCharacters = /^[A-Z0-9]+$/.test(barcode);
        const hasValidLength = barcode.length >= 6 && barcode.length <= 20;
        
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
 * Connects barcode reading with inventory management
 */
class FlexiCartBarcodeIntegration {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.barcodeReader = new FlexiCartBarcodeReader();
        this.scanQueue = [];
        this.autoScanEnabled = false;
    }
    
    /**
     * Scan and update cassette at position
     */
    async scanAndUpdateCassette(position) {
        try {
            console.log(`📼 Scanning cassette at position ${position}...`);
            
            // Read barcode
            const scanResult = await this.barcodeReader.readBarcodeAtPosition(position);
            
            if (!scanResult.success) {
                throw new Error(scanResult.error || 'Barcode read failed');
            }
            
            // Look up barcode in database
            const metadata = this.barcodeReader.lookupBarcode(scanResult.barcode);
            
            // Update inventory with barcode information
            const cassetteData = {
                id: scanResult.barcode, // Use barcode as ID
                barcode: scanResult.barcode,
                scannedBarcode: scanResult.barcode,
                barcodeValid: scanResult.valid,
                lastBarcodeRead: scanResult.timestamp,
                barcodeReadCount: 1,
                ...scanResult.metadata,
                ...(metadata || {}) // Database metadata overrides scan metadata
            };
            
            // Update in state manager
            this.stateManager.inventory.setCassette(position, cassetteData);
            
            console.log(`✅ Cassette updated: ${scanResult.barcode} at position ${position}`);
            
            return {
                success: true,
                position: position,
                barcode: scanResult.barcode,
                cassette: cassetteData
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
     * Scan all occupied positions
     */
    async scanAllOccupiedPositions() {
        const occupiedBins = this.stateManager.inventory.getOccupiedBins();
        const positions = occupiedBins.map(bin => bin.binNumber);
        
        console.log(`🔍 Scanning ${positions.length} occupied positions...`);
        
        const results = [];
        for (const position of positions) {
            const result = await this.scanAndUpdateCassette(position);
            results.push(result);
        }
        
        const successful = results.filter(r => r.success).length;
        console.log(`✅ Barcode scanning completed: ${successful}/${results.length} successful`);
        
        return results;
    }
    
    /**
     * Scan specific positions
     */
    async scanPositions(positions) {
        console.log(`🔍 Scanning positions: ${positions.join(', ')}`);
        
        const results = [];
        for (const position of positions) {
            const result = await this.scanAndUpdateCassette(position);
            results.push(result);
        }
        
        return results;
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
