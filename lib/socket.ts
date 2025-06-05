import { EventEmitter } from 'events';
import type { Socket as SocketIOServerSocket } from 'socket.io';
import type { Socket as SocketIOClientSocket } from 'socket.io-client';
import { Decoder, Encoder } from './parser';
import dbg from 'debug';
import IOStream from './iostream';

const debug = dbg('socket.io-stream:socket');

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

export interface SocketOptions {
  forceBase64?: boolean;
}

/**
 * Bidirectional stream socket which wraps Socket.IO.
 */
export default class Socket extends EventEmitter {
  private readonly sio: SocketIOServerSocket | SocketIOClientSocket;
  private readonly forceBase64: boolean;
  private readonly streams: Record<string, any>;
  private readonly encoder: Encoder;
  private readonly decoder: Decoder;

  public constructor(sio: SocketIOServerSocket | SocketIOClientSocket, options: SocketOptions = {}) {
    super();

    this.sio = sio;
    this.forceBase64 = Boolean(options.forceBase64);
    this.streams = {};
    this.encoder = new Encoder();
    this.decoder = new Decoder();

    // Bind Socket.IO events
    sio.on(EVENT_NAME, (type: string | symbol, ...args: unknown[]) => super.emit(type, ...args));
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

  public $emit(type: string | symbol, ...args: unknown[]): boolean {
    return super.emit(type, ...args);
  }

  /**
   * Emits streams to this corresponding server/client.
   * Overrides EventEmitter.emit to handle stream events specially.
   *
   * @api public
   */
  // @ts-expect-error -- should have returned boolean
  public override emit(type: string, ...args: unknown[]): this {
    if (RESERVED_EVENTS.includes(type)) {
      super.emit(type, ...args);
    } else {
      this._stream(type, ...args);
    }

    return this;
  }

  /**
   * Add event listener with stream support.
   */
  public override on(type: string, listener: (...args: any[]) => void): this {
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
  _stream(type: string, ...args: unknown[]): void {
    debug('sending new streams');

    const ack = args[args.length - 1];
    if (typeof ack === 'function') {
      args[args.length - 1] = (...ackArgs: unknown[]) => {
        const decodedArgs = this.decoder.decode(ackArgs);
        ack.apply(this, decodedArgs);
      };
    }

    const encodedArgs: unknown[] = this.encoder.encode(args);
    this.sio.emit(EVENT_NAME, type, ...encodedArgs);
  }

  /**
   * Notifies the read event.
   *
   * @api private
   */
  _read(id: string, size: number): void {
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
  _write(id: string, chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
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
  public _end(id: string) {
    this.sio.emit(`${EVENT_NAME}-end`, id);
  }

  /**
   * Sends error event to remote stream.
   *
   * @param {string} id - Stream ID
   * @param {Error|string} err - Error object or message
   * @api private
   */
  public _error(id: string, err: Error | string) {
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
  _onstream(type: string, listener: (...args: unknown[]) => void): void {
    if (typeof listener !== 'function') {
      throw new TypeError('listener must be a function');
    }

    const onstream = (...args: unknown[]) => {
      debug('new streams');

      const ack = args[args.length - 1];
      if (typeof ack === 'function') {
        args[args.length - 1] = (...ackArgs: unknown[]) => {
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
  _onread = (id: string, size: number): void => {
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
  _onwrite = (id: string, chunk: unknown, encoding: BufferEncoding, callback: (error?: string | Error | null) => void) => {
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
  _onend = (id: string): void => {
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
  _onerror = (id: string, message: string) => {
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
  _onencode = (stream: IOStream) => {
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
  _ondecode = (stream: IOStream) => {
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
  cleanup(id: string) {
    delete this.streams[id];
  }
}

export { EVENT_NAME as event, RESERVED_EVENTS as events };
