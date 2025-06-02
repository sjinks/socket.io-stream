const { createHash } = require('crypto');
const { PassThrough } = require('stream');

class Checksum extends PassThrough {
  constructor(options) {
    super(options);
    this.hash = createHash('sha1');
    this.resume();
  }

  _write(chunk, encoding, callback) {
    this.hash.update(chunk, encoding);
    super._write(chunk, encoding, callback);
  }

  digest() {
    return this.hash.digest('hex');
  }
}

module.exports = Checksum;
