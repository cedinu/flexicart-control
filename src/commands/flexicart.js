let ports = {};

module.exports = {
  registerPort(channelId, portInstance) {
    ports[channelId] = portInstance;
  },
  async getStatus(channelId) {
    const port = ports[channelId];
    return new Promise((resolve, reject) => {
      port.write(Buffer.from([0x10]));
      port.once('data', data => resolve(data));
      port.once('error', err => reject(err));
    });
  },
  async executeCommand(channelId, cmd) {
    const port = ports[channelId];
    const buffer = Buffer.from(cmd, 'ascii');
    return new Promise((resolve, reject) => {
      port.write(buffer, err => err ? reject(err) : resolve(true));
    });
  }
};
