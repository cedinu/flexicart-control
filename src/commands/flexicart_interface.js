const { SerialPort } = require('serialport');

// Flexicart-specific port paths (adjust as needed)
const FLEXICART_PORTS = Array.from({ length: 8 }, (_, i) => `/dev/ttyRP${i + 16}`);
const FLEXICART_BAUD = 38400;

/**
 * Scan for Flexicart controllers
 * @returns {Promise<Array>} Array of detected Flexicart controllers
 */
async function autoScanFlexicarts() {
  const results = [];
  
  for (const path of FLEXICART_PORTS) {
    try {
      const info = await getFlexicartStatus(path);
      if (info) {
        results.push(info);
      }
    } catch (error) {
      // Port inactive or not a Flexicart - silently continue
      console.debug(`Failed to scan Flexicart port ${path}:`, error.message);
    }
  }
  
  return results;
}

/**
 * Get status from a Flexicart controller
 * @param {string} path - Serial port path
 * @returns {Promise<Object|null>} Flexicart status or null if not detected
 */
async function getFlexicartStatus(path) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path,
      baudRate: FLEXICART_BAUD,
      autoOpen: false
    });

    const timeout = setTimeout(() => {
      port.close();
      reject(new Error('Timeout waiting for Flexicart response'));
    }, 2000);

    port.on('open', () => {
      // Send Flexicart status query command
      port.write('\x01\x30\x30\x73\x74\x61\x74\x75\x73\x0D'); // Example command
    });

    port.on('data', (data) => {
      clearTimeout(timeout);
      port.close();
      
      // Parse Flexicart response
      const response = data.toString();
      if (response.includes('FLEXICART')) {
        resolve({
          path,
          type: 'flexicart',
          model: 'Flexicart Controller',
          status: 'online',
          response: response.trim()
        });
      } else {
        resolve(null);
      }
    });

    port.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    port.open();
  });
}

/**
 * Send command to Flexicart controller
 * @param {string} path - Serial port path
 * @param {string} command - Command to send
 * @returns {Promise<string>} Response from Flexicart
 */
async function sendFlexicartCommand(path, command) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path,
      baudRate: FLEXICART_BAUD,
      autoOpen: false
    });

    const timeout = setTimeout(() => {
      port.close();
      reject(new Error('Timeout waiting for Flexicart response'));
    }, 5000);

    port.on('open', () => {
      port.write(command + '\r');
    });

    port.on('data', (data) => {
      clearTimeout(timeout);
      port.close();
      resolve(data.toString().trim());
    });

    port.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    port.open();
  });
}

module.exports = {
  autoScanFlexicarts,
  getFlexicartStatus,
  sendFlexicartCommand,
  FLEXICART_PORTS,
  FLEXICART_BAUD
};

