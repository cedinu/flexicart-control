# FlexiCart Control System - AI Coding Agent Instructions

## Project Overview

FlexiCart Control is a Node.js-based RS-422 serial communication service for controlling professional broadcast equipment:
- **Sony VTR (Video Tape Recorder)** devices using Sony RS-422 protocol
- **FlexiCart** automated cart machines using Sony-compatible RS-422 protocol
- **RocketPort** serial interface hardware (up to 16 ports: `/dev/ttyRP0` - `/dev/ttyRP15`)

The system provides HTTP/HTTPS REST APIs and WebSocket connectivity for real-time device control and status monitoring.

## Architecture Overview

```
src/
├── index.js                           # Main server entry point (Express + WebSocket)
└── commands/                          # Device communication modules
    ├── vtr_interface.js               # VTR device integration interface
    ├── vtr_commands.js                # Sony VTR protocol commands  
    ├── vtr_cmds_status.js             # VTR status query functions
    ├── vtr_cmds_transport.js          # VTR transport control functions
    ├── vtr_status_parser.js           # Sony VTR response parsing
    ├── vtr.js                         # VTR device abstraction
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
    CS: 0x00        // Checksum (calculated XOR of BC through DATA)
};
```

### Validated FlexiCart Commands
```javascript
// ON-AIR Tally Control (CONFIRMED WORKING)
ON_AIR_TALLY_ON:  { cmd: 0x71, ctrl: 0x01, data: 0x80 }   // Turn ON-AIR tally ON
ON_AIR_TALLY_OFF: { cmd: 0x71, ctrl: 0x00, data: 0x80 }   // Turn ON-AIR tally OFF

// Elevator Movement Commands (PROTOCOL ACCEPTED)  
ELEVATOR_UP:      { cmd: 0x41, ctrl: 0x01, data: 0x80 }   // Move elevator up
ELEVATOR_DOWN:    { cmd: 0x41, ctrl: 0x02, data: 0x80 }   // Move elevator down

// Status Commands
STATUS_REQUEST:   { cmd: 0x61, ctrl: 0x10, data: 0x80 }   // Get device status
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
    
    // Calculate checksum (XOR of bytes 1-7)
    let checksum = 0;
    for (let i = 1; i < 8; i++) {
        checksum ^= command[i];
    }
    command[8] = checksum;      // CS
    
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

// Movement commands (PROTOCOL ACCEPTED)
await sendElevatorCommand('/dev/ttyRP8', 'UP');
await sendElevatorCommand('/dev/ttyRP8', 'DOWN');
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
    "port": "/dev/ttyRP8",
    "baudRate": 38400,
    "dataBits": 8,
    "parity": "even", 
    "stopBits": 1,
    "cartAddress": 0x01,
    "commands": {
        "onAirTally": "CONFIRMED WORKING",
        "elevatorMovement": "PROTOCOL ACCEPTED",
        "statusRequest": "CONFIRMED WORKING"
    }
}
```

## When Working on This Codebase

1. **Always use 38,400 baud, 8E1 settings** for FlexiCart communication
2. **Manage serial ports carefully** - use single connection for multiple commands
3. **Include inter-command delays** (100ms minimum) to prevent communication issues  
4. **Test ON-AIR tally first** - it's the most reliable indicator of working communication
5. **Check `tests/flexicart_protocol_test.js`** for latest working examples
6. **Use `/dev/ttyRP8` and cart address `0x01`** as validated working configuration
7. **Remember checksum calculation** - XOR of bytes 1-7 in 9-byte command format

## Recent Discoveries

- ON-AIR tally functionality is fully operational and provides clear status feedback
- Elevator movement commands are accepted by the protocol but physical movement confirmation requires visual verification
- Port locking issues resolved by using single-connection approach for multiple commands
- FlexiCart responds to multiple cart addresses (0x01, 0x02, 0x04, 0x08) on the same serial port
- Response analysis shows clear distinction between sync bytes (0xFF) and data bytes

This codebase represents a mature, working industrial communication system with validated protocols and comprehensive testing infrastructure.
