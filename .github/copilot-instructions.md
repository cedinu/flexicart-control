# FlexiCart Control System - AI Coding Agent Instructions

## Project Overview

FlexiCart Control is a Node.js-based RS-422 serial communication service for controlling professional broadcast equipment:
- **Sony VTR (Video Tape Recorder)** devices using Sony RS-422 protocol
- **FlexiCart** automated cart machines using Sony-compatible RS-422 protocol
- **RocketPort** serial interface hardware (up to 16 ports: `/dev/ttyRP0` - `/dev/ttyRP15`)

The system provides HTTP/HTTPS REST APIs and WebSocket connectivity for real-time device control and status monitoring.

### FlexiCart System Specifications
- **Capacity**: Up to 360 cartridges in automated carousel system
- **Cart Types**: Supports various NAB cartridge formats (A, B, C sizes)
- **Control Interface**: Sony RS-422 compatible protocol
- **Response System**: Immediate ACK/NACK responses with separate status interrogation required
- **Multi-Unit Support**: Daisy-chain up to 8 units on single RS-422 port

## Architecture Overview

```
src/
├── index.js                           # Main server entry point (Express + WebSocket)
└── commands/                          # Device communication modules
    ├── flexicart_interface.js         # FlexiCart integration interface
    ├── flexicart.js                   # FlexiCart device abstraction
    ├── flexicart_cmds_status.js       # FlexiCart status functions
    ├── flexicart_cmds_transport.js    # FlexiCart movement/control functions
    ├── flexicart_serial_utils.js      # FlexiCart serial communication utilities
    ├── flexicart_sony_protocol.js     # Sony-compatible FlexiCart protocol
    ├── flexicart_sony_advanced.js     # Advanced FlexiCart protocol features
    └── flexicart_status_parser.js     # FlexiCart response parsing

tests/                                 # Comprehensive device testing suite
config/                               # Configuration files
├── default.json                      # Device port mappings and settings
├── status.json                       # Auto-discovered device status
└── flexicart-control.service         # SystemD service definition

scripts/                              # Deployment and management scripts
```

## Key Technical Specifications

### RS-422 Communication Standards
- **Baud Rate**: 38,400 (confirmed working for both VTR and FlexiCart)
- **Data Format**: 8 data bits, Even parity, 1 stop bit (8E1)
- **Hardware**: RocketPort serial cards (`/dev/ttyRP0` through `/dev/ttyRP15`)
- **Protocol**: Sony RS-422 command/response structure

### FlexiCart Protocol Structure (9-byte format)
```javascript
const FLEXICART_COMMAND = {
    STX: 0x02,      // Start of text marker
    BC: 0x06,       // Byte count (always 6 for data portion)  
    UA1: 0x01,      // Unit address 1 (always 0x01)
    UA2: 0x01,      // Unit address 2 (cart address: 0x01, 0x02, 0x04, 0x08, etc.)
    BT: 0x00,       // Block type (0x00 for normal commands)
    CMD: 0x00,      // Command byte (see FLEXICART_COMMANDS)
    CTRL: 0x00,     // Control byte (command parameter)
    DATA: 0x80,     // Data byte (typically 0x80)  
    CS: 0x00        // Checksum (calculated 2's complement of BC through DATA)
};
```

### FlexiCart Command Categories

#### 1. Immediate Response Commands (Direct Status)
Commands that return immediate status information without ACK/NACK:
```javascript
STATUS_REQUEST:    { cmd: 0x61, ctrl: 0x10, data: 0x80 }   // Get device status
POSITION_REQUEST:  { cmd: 0x61, ctrl: 0x20, data: 0x80 }   // Get current position
INVENTORY_REQUEST: { cmd: 0x61, ctrl: 0x30, data: 0x80 }   // Get cart inventory
ERROR_STATUS:      { cmd: 0x61, ctrl: 0x40, data: 0x80 }   // Get error conditions
```

#### 2. Macro Commands (ACK/NACK + Status Interrogation Required)
Commands that return ACK (0x10) or NACK (0x11), requiring separate status checks:

```javascript
// Movement Commands - Return ACK/NACK immediately, status via interrogation
ELEVATOR_UP:       { cmd: 0x41, ctrl: 0x01, data: 0x80 }   // Move elevator up
ELEVATOR_DOWN:     { cmd: 0x41, ctrl: 0x02, data: 0x80 }   // Move elevator down
CAROUSEL_CW:       { cmd: 0x42, ctrl: 0x01, data: 0x80 }   // Rotate carousel clockwise
CAROUSEL_CCW:      { cmd: 0x42, ctrl: 0x02, data: 0x80 }   // Rotate carousel counter-clockwise
MOVE_TO_POSITION:  { cmd: 0x43, ctrl: pos, data: 0x80 }    // Move to specific cart position

// Cart Operations - Return ACK/NACK immediately, completion via interrogation  
LOAD_CART:         { cmd: 0x44, ctrl: 0x01, data: 0x80 }   // Load cart into player
UNLOAD_CART:       { cmd: 0x44, ctrl: 0x02, data: 0x80 }   // Unload cart from player
EJECT_CART:        { cmd: 0x45, ctrl: 0x01, data: 0x80 }   // Eject cart to access bay

// System Commands - Return ACK/NACK immediately
INITIALIZE:        { cmd: 0x46, ctrl: 0x01, data: 0x80 }   // Initialize system
CALIBRATE:         { cmd: 0x47, ctrl: 0x01, data: 0x80 }   // Calibrate positions
EMERGENCY_STOP:    { cmd: 0x48, ctrl: 0x01, data: 0x80 }   // Emergency stop all motion
```

#### 3. Control Commands (Immediate Effect)
Commands that execute immediately and return confirmation:
```javascript
// Confirmed working - immediate status change
ON_AIR_TALLY_ON:   { cmd: 0x71, ctrl: 0x01, data: 0x80 }   // Turn ON-AIR tally ON
ON_AIR_TALLY_OFF:  { cmd: 0x71, ctrl: 0x00, data: 0x80 }   // Turn ON-AIR tally OFF

// Audio/Transport Control - immediate effect
PLAY_COMMAND:      { cmd: 0x50, ctrl: 0x01, data: 0x80 }   // Start cart playback
STOP_COMMAND:      { cmd: 0x50, ctrl: 0x00, data: 0x80 }   // Stop cart playback
PAUSE_COMMAND:     { cmd: 0x50, ctrl: 0x02, data: 0x80 }   // Pause cart playback
```

### Macro Command Response Protocol

**CRITICAL CONCEPT**: FlexiCart uses a two-stage command system for complex operations:

1. **Initial Response**: ACK (0x10) = Command accepted, NACK (0x11) = Command rejected
2. **Status Interrogation**: Separate status requests needed to determine completion

```javascript
// Example: Moving elevator UP
async function moveElevatorUp(port, cartAddress = 0x01) {
    // Step 1: Send movement command
    const moveCommand = createFlexiCartCommand(0x41, 0x01, 0x80, cartAddress);
    const initialResponse = await sendCommand(port, moveCommand);
    
    // Step 2: Check initial ACK/NACK
    if (initialResponse[0] === 0x10) {
        console.log("Command accepted - movement initiated");
        
        // Step 3: Poll status until movement complete
        let attempts = 0;
        while (attempts < 50) { // Max 5 seconds at 100ms intervals
            await delay(100);
            const statusResponse = await getMovementStatus(port, cartAddress);
            
            if (statusResponse.movementComplete) {
                return { success: true, position: statusResponse.position };
            }
            attempts++;
        }
        return { success: false, error: 'Movement timeout' };
        
    } else if (initialResponse[0] === 0x11) {
        return { success: false, error: 'Command rejected (NACK)' };
    }
}
```

## Development Guidelines

### Serial Port Management Best Practices

**CRITICAL**: FlexiCart devices require careful port management to avoid locking issues.

```javascript
// ✅ CORRECT: Single connection for multiple commands
async function sendMultipleCommands(port, commands) {
    const serialPort = new SerialPort({ path: port, baudRate: 38400, dataBits: 8, parity: 'even', stopBits: 1, autoOpen: false });
    
    try {
        await openPortAsync(serialPort);
        const results = [];
        
        for (const command of commands) {
            const response = await sendCommandOnOpenPort(serialPort, command);
            results.push(response);
            await delay(100); // Inter-command delay
        }
        
        return results;
    } finally {
        await closePortAsync(serialPort);
    }
}

// ❌ INCORRECT: Multiple open/close cycles cause port locking
async function badExample(port, commands) {
    for (const command of commands) {
        const response = await sendCommand(port, command); // Opens and closes port each time
    }
}
```

### Macro Command Implementation Pattern

**ESSENTIAL**: Proper handling of ACK/NACK responses and status polling:

```javascript
// Complete macro command implementation
async function executeMacroCommand(port, command, cartAddress = 0x01, timeoutMs = 5000) {
    const commandBuffer = createFlexiCartCommand(command.cmd, command.ctrl, command.data, cartAddress);
    
    try {
        // Step 1: Send command and get immediate ACK/NACK
        const initialResponse = await sendCommand(port, commandBuffer, 1000);
        
        if (initialResponse.length === 0) {
            throw new FlexicartError('No response to command', 'NO_RESPONSE');
        }
        
        const ackByte = initialResponse[0];
        
        if (ackByte === 0x11) { // NACK
            throw new FlexicartError('Command rejected by device', 'COMMAND_NACK');
        }
        
        if (ackByte !== 0x10) { // Not ACK
            throw new FlexicartError(`Unexpected response: 0x${ackByte.toString(16)}`, 'UNEXPECTED_RESPONSE');
        }
        
        // Step 2: Command accepted (ACK), now poll for completion
        const startTime = Date.now();
        const statusCommand = { cmd: 0x61, ctrl: 0x10, data: 0x80 }; // General status
        
        while ((Date.now() - startTime) < timeoutMs) {
            await delay(100); // Poll interval
            
            const statusResponse = await getFlexicartStatus(port, cartAddress);
            
            // Check for completion based on command type
            if (isCommandComplete(command, statusResponse)) {
                return {
                    success: true,
                    initialResponse: ackByte,
                    finalStatus: statusResponse,
                    executionTime: Date.now() - startTime
                };
            }
            
            // Check for error conditions
            if (statusResponse.error) {
                throw new FlexicartError(`Operation failed: ${statusResponse.error}`, 'OPERATION_FAILED');
            }
        }
        
        throw new FlexicartError('Command timeout - operation may still be in progress', 'COMMAND_TIMEOUT');
        
    } catch (error) {
        throw new FlexicartError(`Macro command failed: ${error.message}`, 'MACRO_COMMAND_FAILED', { command, error });
    }
}

// Determine if macro command has completed based on status
function isCommandComplete(command, status) {
    switch (command.cmd) {
        case 0x41: // Elevator movement
            return !status.elevatorMoving;
        case 0x42: // Carousel rotation  
            return !status.carouselMoving;
        case 0x43: // Move to position
            return !status.elevatorMoving && !status.carouselMoving;
        case 0x44: // Load/Unload cart
            return status.loadComplete || status.unloadComplete;
        case 0x45: // Eject cart
            return status.ejectComplete;
        case 0x46: // Initialize
            return status.initializationComplete;
        case 0x47: // Calibrate
            return status.calibrationComplete;
        default:
            return true; // Unknown command, assume complete
    }
}
```

### Status Interrogation Patterns

```javascript
// Comprehensive status checking for different aspects
async function getFlexicartStatus(port, cartAddress = 0x01) {
    const responses = await sendMultipleCommands(port, [
        createFlexiCartCommand(0x61, 0x10, 0x80, cartAddress), // General status
        createFlexiCartCommand(0x61, 0x20, 0x80, cartAddress), // Position status  
        createFlexiCartCommand(0x61, 0x40, 0x80, cartAddress)  // Error status
    ]);
    
    return {
        general: parseGeneralStatus(responses[0]),
        position: parsePositionStatus(responses[1]),  
        errors: parseErrorStatus(responses[2]),
        elevatorMoving: checkMovementStatus(responses[0], 'elevator'),
        carouselMoving: checkMovementStatus(responses[0], 'carousel'),
        currentPosition: extractPosition(responses[1]),
        timestamp: new Date().toISOString()
    };
}
```

### Command Construction Pattern

```javascript
function createFlexiCartCommand(cmd, ctrl = 0x00, data = 0x80, cartAddress = 0x01) {
    const command = Buffer.alloc(9);
    command[0] = 0x02;          // STX
    command[1] = 0x06;          // BC
    command[2] = 0x01;          // UA1
    command[3] = cartAddress;   // UA2
    command[4] = 0x00;          // BT
    command[5] = cmd;           // CMD
    command[6] = ctrl;          // CTRL
    command[7] = data;          // DATA
    
    // CRITICAL: Use 2's complement checksum (NOT XOR)
    let sum = 0;
    for (let i = 1; i < 8; i++) {
        sum += command[i];
    }
    command[8] = (0x100 - (sum & 0xFF)) & 0xFF;  // CS
    
    return command;
}
```

### Response Analysis Pattern

```javascript
function analyzeFlexiCartResponse(response) {
    const analysis = {
        length: response.length,
        hex: response.toString('hex').match(/.{2}/g)?.join(' ') || '',
        bytes: Array.from(response),
        hasSync: false,
        syncCount: 0,
        nonSyncBytes: [],
        changes: []
    };
    
    // Track sync bytes (0xFF) vs data bytes
    response.forEach((byte, index) => {
        if (byte === 0xFF) {
            analysis.hasSync = true;
            analysis.syncCount++;
        } else {
            analysis.nonSyncBytes.push(byte);
        }
    });
    
    return analysis;
}
```

## Code Style and Conventions

### File Naming Conventions
- **Interface files**: `*_interface.js` (main integration points)
- **Command modules**: `*_cmds_*.js` (specialized command groups)
- **Protocol implementations**: `*_protocol.js` (low-level protocol handling)
- **Status parsers**: `*_status_parser.js` (response interpretation)
- **Utility modules**: `*_utils.js` (shared functionality)

### Function Naming Patterns
- **Device queries**: `get*Status()`, `get*Position()`, `scan*Devices()`
- **Device control**: `move*ToPosition()`, `send*Command()`, `establish*Control()`
- **Data parsing**: `parse*Status()`, `parse*Response()`, `analyze*Data()`
- **Async operations**: All device communication functions are async/await

### Error Handling Standards

```javascript
// Custom error classes for device-specific issues
class FlexicartError extends Error {
    constructor(message, code, data = null) {
        super(message);
        this.name = 'FlexicartError';
        this.code = code;
        this.data = data;
    }
}

// Standard error handling pattern
async function deviceOperation(port, command) {
    try {
        const response = await sendCommand(port, command);
        return parseResponse(response);
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new FlexicartError('Device not found', 'DEVICE_NOT_FOUND', { port });
        }
        throw error; // Re-throw unexpected errors
    }
}
```

## Testing Patterns

### Device Communication Testing
- **Location**: `tests/` directory contains comprehensive device test suites
- **Pattern**: Each test file focuses on specific functionality (status, movement, communication)
- **Approach**: Progressive testing from basic communication to advanced features

### Validated Test Scenarios
```javascript
// Basic communication test
await testFlexicartCommunication('/dev/ttyRP8', 0x01);

// ON-AIR tally functionality (CONFIRMED WORKING)
await sendOnAirCommand('/dev/ttyRP8', true);  // Turn ON
await sendOnAirCommand('/dev/ttyRP8', false); // Turn OFF

// Movement commands (PROTOCOL ACCEPTED - ACK/NACK + Status Required)
const elevatorResult = await executeMacroCommand('/dev/ttyRP8', FLEXICART_COMMANDS.ELEVATOR_UP);
const carouselResult = await executeMacroCommand('/dev/ttyRP8', FLEXICART_COMMANDS.CAROUSEL_CW);

// Status interrogation (CONFIRMED WORKING)
const status = await getFlexicartStatus('/dev/ttyRP8', 0x01);
console.log('Current position:', status.currentPosition);
console.log('Movement active:', status.elevatorMoving || status.carouselMoving);
```

## API Integration Points

### HTTP/HTTPS REST Endpoints
- Server supports both HTTP (dev) and HTTPS (production) modes
- WebSocket connectivity for real-time device monitoring  
- Auto-discovery of connected devices on startup
- Device status cached in `config/status.json`

### WebSocket Event Structure
```javascript
// Device status updates
{
    type: 'device_status',
    deviceType: 'flexicart',
    deviceId: 'cart_01', 
    status: { /* parsed status data */ },
    timestamp: '2024-01-01T12:00:00.000Z'
}

// Command responses  
{
    type: 'command_response',
    command: 'on_air_tally',
    success: true,
    data: { /* response data */ }
}
```

## Configuration Management

### Device Auto-Discovery
- System automatically scans `/dev/ttyRP0` through `/dev/ttyRP15` on startup
- Detected devices written to `config/status.json`
- Supports mixed VTR and FlexiCart device configurations

### Production Deployment
- SystemD service file: `config/flexicart-control.service`
- SSL certificate support for HTTPS/WSS
- Environment-based configuration (development vs production)

## Working Configuration (Validated)

```json
{
    "port": "/dev/ttyRP0",
    "baudRate": 38400,
    "dataBits": 8,
    "parity": "even", 
    "stopBits": 1,
    "cartAddress": 0x01,
    "ackResponse": "0x04",
    "commands": {
        "onAirTally": "CONFIRMED WORKING",
        "elevatorMovement": "MACRO COMMAND - ACK/NACK + STATUS",
        "statusRequest": "CONFIRMED WORKING",
        "carouselMovement": "MACRO COMMAND - ACK/NACK + STATUS",
        "cartOperations": "MACRO COMMAND - ACK/NACK + STATUS"
    },
    "macroCommandTimeout": 5000,
    "statusPollInterval": 100,
    "correctedSetup": {
        "cabling": "CORRECTED - /dev/ttyRP0 working",
        "ackProtocol": "CORRECTED - 0x04 ACK response confirmed"
    }
}
```

## When Working on This Codebase

1. **Always use 38,400 baud, 8E1 settings** for FlexiCart communication
2. **Use /dev/ttyRP0 with corrected cabling** - hardware issue resolved
3. **Expect ACK response 0x04** - corrected protocol implementation 
4. **Manage serial ports carefully** - use single connection for multiple commands
5. **Include inter-command delays** (100ms minimum) to prevent communication issues  
6. **Test status commands first** - immediate response validation for basic connectivity
7. **Check `tests/flexicart_test_runner.js`** for comprehensive corrected test suite
8. **Use cart address `0x01`** as validated working configuration
9. **CRITICAL: Use 2's complement checksum** - sum bytes 1-7, then `(0x100 - (sum & 0xFF)) & 0xFF`
10. **Implement macro command pattern** - handle ACK/NACK + status polling for complex operations
11. **Always timeout macro operations** - use 5-second timeout with 100ms status polling

## Recent Discoveries

- **CORRECTED SETUP**: Cabling issue resolved - `/dev/ttyRP0` now working correctly
- **CORRECTED ACK PROTOCOL**: FlexiCart responds with 0x04 (not 0x10) for command acceptance
- **CRITICAL CHECKSUM DISCOVERY**: FlexiCart requires 2's complement checksum (NOT XOR)
- **Macro command system**: Movement and cart operations use ACK/NACK + status interrogation pattern
- **Status commands working**: Immediate response commands return data directly
- **Port management critical**: Single-connection approach prevents port locking issues
- **FlexiCart multi-addressing**: Responds to multiple cart addresses (0x01, 0x02, 0x04, 0x08) on same port
- **Status interrogation**: Essential for determining completion of macro operations
- **Response patterns**: Clear distinction between immediate responses (data) and macro responses (ACK/NACK)
- **Test suite updated**: Comprehensive new test suite validates corrected setup
- **Checksum method validated**: 2's complement checksum confirmed via comprehensive testing

## Updated Test Architecture

The test suite has been completely rewritten to reflect the corrected setup:

- **`flexicart_test_runner.js`**: Master test orchestrator with corrected configuration
- **`flexicart_communication_validator.js`**: Basic communication validation with 0x04 ACK
- **`flexicart_status_test.js`**: Immediate response command testing
- **`flexicart_macro_test.js`**: Macro command ACK/NACK + status polling validation
- **`flexicart_master_test.js`**: Comprehensive protocol test suite

All tests configured for `/dev/ttyRP0` with 0x04 ACK response expectation.

This codebase represents a mature, working industrial communication system with validated protocols and comprehensive testing infrastructure. The macro command system is critical for proper FlexiCart operation, and the corrected hardware setup ensures reliable communication.


