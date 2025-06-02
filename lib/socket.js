const { EventEmitter } = require('events');
const parser = require('./parser');
const debug = require('debug')('socket.io-stream:socket');

/**
 * Base event name for messaging.
 *
 * @api public
 */
const EVENT_NAME = '$stream';

const RESERVED_EVENTS = [
  'error',
  'newListener',
  'removeListener'
];

/**
 * Bidirectional stream socket which wraps Socket.IO.
 */
class Socket extends EventEmitter {
  /**
   * @param {import('socket.io').Socket} sio - Socket.IO socket instance
   * @param {Object} [options] - Configuration options
   * @param {boolean} [options.forceBase64] - Force base64 encoding
   */
  constructor(sio, options = {}) {
    super();

    this.sio = sio;
    this.forceBase64 = Boolean(options.forceBase64);
    this.streams = {};
    this.encoder = new parser.Encoder();
    this.decoder = new parser.Decoder();

    // Bind Socket.IO events
    sio.on(EVENT_NAME, (...args) => super.emit(...args));
    sio.on(`${EVENT_NAME}-read`, this._onread);
    sio.on(`${EVENT_NAME}-write`, this._onwrite);
    sio.on(`${EVENT_NAME}-end`, this._onend);
    sio.on(`${EVENT_NAME}-error`, this._onerror);
    sio.on('error', (err) => super.emit('error', err));
    sio.on('disconnect', this._ondisconnect);

    // Bind parser events
    this.encoder.on('stream', this._onencode);
    this.decoder.on('stream', this._ondecode);
  }

  $emit(type, ...args) {
    return super.emit(type, ...args);
  }

  /**
   * Emits streams to this corresponding server/client.
   * Overrides EventEmitter.emit to handle stream events specially.
   *
   * @param {string} type - Event type
   * @param {...any} args - Arguments to emit
   * @return {this} self for chaining
   * @api public
   */
  emit(type, ...args) {
    if (RESERVED_EVENTS.includes(type)) {
      super.emit(type, ...args);
      return this;
    }
    this._stream(type, ...args);
    return this;
  }

  /**
   * Add event listener with stream support.
   *
   * @param {string} type - Event type
   * @param {(...args: any[]) => void} listener - Event listener
   * @return {this} self
   */
  on(type, listener) {
    if (RESERVED_EVENTS.includes(type)) {
      return super.on(type, listener);
    }

    this._onstream(type, listener);
    return this;
  }

  /**
   * Sends a new stream request.
   *
   * @param {string} type - Event type
   * @param {...any} args - Arguments including streams
   * @api private
   */
  _stream(type, ...args) {
    debug('sending new streams');

    const ack = args[args.length - 1];
    if (typeof ack === 'function') {
      args[args.length - 1] = (...ackArgs) => {
        const decodedArgs = this.decoder.decode(ackArgs);
        ack.apply(this, decodedArgs);
      };
    }

    const encodedArgs = this.encoder.encode(args);
    this.sio.emit(EVENT_NAME, type, ...encodedArgs);
  }

  /**
   * Notifies the read event.
   *
   * @param {string} id - Stream ID
   * @param {number} size - Read size
   * @api private
   */
  _read(id, size) {
    this.sio.emit(`${EVENT_NAME}-read`, id, size);
  }

  /**
   * Requests to write a chunk.
   *
   * @param {string} id - Stream ID
   * @param {Buffer|string|ArrayBuffer} chunk - Data chunk
   * @param {string} encoding - Encoding type
   * @param {Function} callback - Callback function
   * @api private
   */
  _write(id, chunk, encoding, callback) {
    if (Buffer.isBuffer(chunk)) {
      if (this.forceBase64) {
        encoding = 'base64';
        chunk = chunk.toString('base64');
      } else if (!global.Buffer) {
        // socket.io can't handle Buffer when using browserify.
        if ('toArrayBuffer' in chunk && typeof chunk.toArrayBuffer === 'function') {
          chunk = chunk.toArrayBuffer();
        } else {
          chunk = chunk.buffer;
        }
      }
    }
    this.sio.emit(`${EVENT_NAME}-write`, id, chunk, encoding, callback);
  }

  /**
   * Sends end event to remote stream.
   *
   * @param {string} id - Stream ID
   * @api private
   */
  _end(id) {
    this.sio.emit(`${EVENT_NAME}-end`, id);
  }

  /**
   * Sends error event to remote stream.
   *
   * @param {string} id - Stream ID
   * @param {Error|string} err - Error object or message
   * @api private
   */
  _error(id, err) {
    const message = typeof err === 'string' ? err : err.message || String(err);
    this.sio.emit(`${EVENT_NAME}-error`, id, message);
  }

  /**
   * Handles a new stream request.
   *
   * @param {string} type - Event type
   * @param {(...args: any[]) => void} listener - Event listener
   * @api private
   */
  _onstream(type, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('listener must be a function');
    }

    const onstream = (...args) => {
      debug('new streams');

      const ack = args[args.length - 1];
      if (typeof ack === 'function') {
        args[args.length - 1] = (...ackArgs) => {
          const encodedArgs = this.encoder.encode(ackArgs);
          ack.apply(this, encodedArgs);
        };
      }

      const decodedArgs = this.decoder.decode(args);
      listener.apply(this, decodedArgs);
    };

    // Store original listener for removeListener
    onstream.listener = listener;

    super.on(type, onstream);
  }

  /**
   * Handles read request from remote stream.
   *
   * @param {string} id - Stream ID
   * @param {number} size - Read size
   * @api private
   */
  _onread = (id, size) => {
    debug('read: "%s"', id);

    const stream = this.streams[id];
    if (stream) {
      stream._onread(size);
    } else {
      debug('ignore invalid stream id');
    }
  };

  /**
   * Handles write request from remote stream.
   *
   * @param {string} id - Stream ID
   * @param {any} chunk - Data chunk
   * @param {string} encoding - Encoding type
   * @param {Function} callback - Callback function
   * @api private
   */
  _onwrite = (id, chunk, encoding, callback) => {
    debug('write: "%s"', id);

    const stream = this.streams[id];
    if (!stream) {
      callback(`invalid stream id: ${id}`);
      return;
    }

    if (global.ArrayBuffer && chunk instanceof ArrayBuffer) {
      // Make sure that chunk is a buffer for stream
      chunk = Buffer.from(new Uint8Array(chunk));
    }
    stream._onwrite(chunk, encoding, callback);
  };

  /**
   * Handles end event from remote stream.
   *
   * @param {string} id - Stream ID
   * @api private
   */
  _onend = (id) => {
    debug('end: "%s"', id);

    const stream = this.streams[id];
    if (!stream) {
      debug('ignore non-existent stream id: "%s"', id);
      return;
    }

    stream._end();
  };

  /**
   * Handles error event from remote stream.
   *
   * @param {string} id - Stream ID
   * @param {string} message - Error message
   * @api private
   */
  _onerror = (id, message) => {
    debug('error: "%s", "%s"', id, message);

    const stream = this.streams[id];
    if (!stream) {
      debug('invalid stream id: "%s"', id);
      return;
    }

    const err = new Error(message);
    // @ts-ignore - Adding custom property for error source tracking
    err.remote = true;
    stream.emit('error', err);
  };

  /**
   * Handles disconnect event from socket.io.
   * Destroys all active streams.
   *
   * @api private
   */
  _ondisconnect = () => {
    for (const id in this.streams) {
      const stream = this.streams[id];
      stream.destroy();

      // Close streams when the underlying
      // socket.io connection is closed (regardless why)
      stream.emit('close');
      stream.emit('error', new Error('Connection aborted'));
    }
  };

  /**
   * Handles encoded stream from encoder.
   *
   * @param {import('./iostream')} stream - Stream instance
   * @api private
   */
  _onencode = (stream) => {
    if (stream.socket || stream.destroyed) {
      throw new Error('stream has already been sent.');
    }

    const { id } = stream;
    if (this.streams[id]) {
      throw new Error(`Encoded stream already exists: ${id}`);
    }

    this.streams[id] = stream;
    stream.socket = this;
  }

  /**
   * Handles decoded stream from decoder.
   *
   * @param {import('./iostream')} stream - Stream instance
   * @api private
   */
  _ondecode = (stream) => {
    const { id } = stream;
    if (this.streams[id]) {
      this._error(id, new Error(`Decoded stream already exists: ${id}`));
      return;
    }

    this.streams[id] = stream;
    stream.socket = this;
  }

  /**
   * Cleans up stream reference.
   *
   * @param {string} id - Stream ID
   * @api public
   */
  cleanup(id) {
    delete this.streams[id];
  }
}

// Export the Socket class and constants
module.exports = Socket;
module.exports.event = EVENT_NAME;
module.exports.events = RESERVED_EVENTS;
