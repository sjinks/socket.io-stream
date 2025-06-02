const { io } = require('socket.io-client');

/**
 * @param {number} port
 * @param {object} [options]
 */
exports.client = function(port, options) {
  options = options || {};

  const _options = {
    forceNew: true
  };

  for (const key in options) {
    _options[key] = options[key];
  }

  return io(`http://localhost:${port}`, _options);
};
