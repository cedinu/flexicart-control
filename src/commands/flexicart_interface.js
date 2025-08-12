/**
 * Flexicart Interface - Main Integration Module
 * Combines status, transport, and parsing functionality
 */

// Import from the new serial utils module
const { sendCommand, FlexicartError } = require('./flexicart_serial_utils');

// Import specialized modules
const {
    getFlexicartStatus,
    getFlexicartPosition,
    getFlexicartInventory,
    getFlexicartErrors,
    clearFlexicartErrors,
    testFlexicartCommunication,
    autoScanFlexicarts,
    FLEXICART_COMMANDS
} = require('./flexicart_cmds_status');

const {
    sendFlexicartCommand,
    moveFlexicartHome,
    moveFlexicartToPosition,
    emergencyStopFlexicart,
    calibrateFlexicart,
    establishFlexicartControl,
    testFlexicartMovement,
    FLEXICART_MOVEMENT_COMMANDS
} = require('./flexicart_cmds_transport');

const {
    parseFlexicartStatus,
    parseFlexicartPosition,
    parseFlexicartInventory,
    parseFlexicartErrors,
    parseFlexicartMoveResponse,
    parseFlexicartCalibrationResponse,
    FLEXICART_STATUS_CODES,
    FLEXICART_ERROR_CODES
} = require('./flexicart_status_parser');

// Export all functionality from the specialized modules
module.exports = {
    // Status functions
    getFlexicartStatus,
    getFlexicartPosition,
    getFlexicartInventory,
    getFlexicartErrors,
    clearFlexicartErrors,
    testFlexicartCommunication,
    autoScanFlexicarts,
    
    // Transport functions
    sendFlexicartCommand,
    moveFlexicartHome,
    moveFlexicartToPosition,
    emergencyStopFlexicart,
    calibrateFlexicart,
    establishFlexicartControl,
    testFlexicartMovement,
    
    // Parsing functions
    parseFlexicartStatus,
    parseFlexicartPosition,
    parseFlexicartInventory,
    parseFlexicartErrors,
    parseFlexicartMoveResponse,
    parseFlexicartCalibrationResponse,
    
    // Core utility
    sendCommand,
    
    // Constants and classes
    FLEXICART_COMMANDS,
    FLEXICART_MOVEMENT_COMMANDS,
    FLEXICART_STATUS_CODES,
    FLEXICART_ERROR_CODES,
    FlexicartError
};

