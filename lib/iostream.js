const { Duplex } = require('stream');
const uuid = require('./uuid');
const debug = require('debug')('socket.io-stream:iostream');

/**
 * Duplex stream for socket.io-stream
 */
class IOStream extends Duplex {
  /**
   * @param {Object} [options] - Stream options
   * @api private
   */
  constructor(options) {
    super(options);

    this.options = options;
    this.id = uuid();
    this.socket = null;

    // Buffers
    this.pushBuffer = [];
    this.writeBuffer = [];

    // Op states
    this._readable = false;
    this._writable = false;

    // default to *not* allowing half open sockets
    this.allowHalfOpen = options?.allowHalfOpen || false;

    this.on('finish', this._onfinish);
    this.on('end', this._onend);
    this.on('error', this._onerror);
  }

  /**
   * Ensures that no more I/O activity happens on this stream.
   * Not necessary in the usual case.
   *
   * @api public
   */
  destroy() {
    debug('destroy');

    if (this.destroyed) {
      debug('already destroyed');
      return this;
    }

    super.destroy();

    if (this.socket) {
      debug('clean up');
      this.socket.cleanup(this.id);
      this.socket = null;
    }

    return this;
  }

  /**
   * Local read
   *
   * @api private
   */
  _read(size) {
    // We cannot read from the socket if it's destroyed obviously ...
    if (this.destroyed) return;

    if (this.pushBuffer.length) {
      // flush buffer and end if it exists.
      let push;
      while ((push = this.pushBuffer.shift())) {
        if (!push()) break;
      }
      return;
    }

    this._readable = true;

    // Go get data from remote stream
    // Calls ._onread remotely then ._onwrite locally
    this.socket._read(this.id, size);
  }

  /**
   * Read from remote stream
   *
   * @api private
   */
  _onread(size) {
    const write = this.writeBuffer.shift();
    if (write) return write();

    this._writable = true;
  }

  /**
   * Write local data to remote stream
   * Calls remote ._onwrite
   *
   * @api private
   */
  _write(chunk, encoding, callback) {
    const write = () => {
      // We cannot write to the socket if it's destroyed obviously ...
      if (this.destroyed) return;

      this._writable = false;
      this.socket._write(this.id, chunk, encoding, callback);
    };

    if (this._writable) {
      write();
    } else {
      this.writeBuffer.push(write);
    }
  }

  /**
   * Write the data fetched remotely
   * so that we can now read locally
   *
   * @api private
   */
  _onwrite(chunk, encoding, callback) {
    const push = () => {
      this._readable = false;
      const ret = this.push(chunk || '', encoding);
      callback();
      return ret;
    };

    if (this._readable) {
      push();
    } else {
      this.pushBuffer.push(push);
    }
  }

  /**
   * When ending send 'end' event to remote stream
   *
   * @api private
   */
  _end() {
    if (this.pushBuffer.length) {
      // end after flushing buffer.
      this.pushBuffer.push(() => this._done());
    } else {
      this._done();
    }
  }

  /**
   * Remote stream just ended
   *
   * @api private
   */
  _done() {
    this._readable = false;
    // signal the end of the data.
    return this.push(null);
  }

  /**
   * the user has called .end(), and all the bytes have been
   * sent out to the other side.
   * If allowHalfOpen is false, or if the readable side has
   * ended already, then destroy.
   * If allowHalfOpen is true, then we need to set writable false,
   * so that only the writable side will be cleaned up.
   *
   * @api private
   */
  _onfinish() {
    debug('_onfinish');
    // Local socket just finished
    // send 'end' event to remote
    this.socket?._end(this.id);

    if (!this.writableEnded) {
      this.end();
    }

    if (!this.readable || this._readableState.ended) {
      debug('_onfinish: ended, destroy %s', this._readableState);
      return this.destroy();
    }

    debug('_onfinish: not ended');

    if (!this.allowHalfOpen) {
      this.push(null);

      // just in case we're waiting for an EOF.
      if (this.readable && !this.readableEnded) {
        this.read(0);
      }
    }
  }

  /**
   * the EOF has been received, and no more bytes are coming.
   * if the writable side has ended already, then clean everything
   * up.
   *
   * @api private
   */
  _onend() {
    debug('_onend');
    if (!this.readableEnded) {
      this.push(null);
    }

    if (!this.writable || this.writableFinished) {
      debug('_onend: %s', this.writableFinished);
      return this.destroy();
    }

    debug('_onend: not finished');

    if (!this.allowHalfOpen) {
      this.end();
    }
  }

  /**
   * When error in local stream
   * notify remote
   * if err.remote = true
   * then error happened on remote stream
   *
   * @api private
   */
  _onerror(err) {
    // check if the error came from remote stream.
    if (!err.remote && this.socket) {
      // notify the error to the corresponding remote stream.
      this.socket._error(this.id, err);
    }

    this.destroy();
  }
}

module.exports = IOStream;
