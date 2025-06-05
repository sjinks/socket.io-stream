import { Duplex, type DuplexOptions } from 'stream';
import uuid from './uuid';
import dbg from 'debug';
import Socket from './socket';

const debug = dbg('socket.io-stream:iostream');

type PushFunction = () => boolean;
type WriteFunction = () => void;

/**
 * Duplex stream for socket.io-stream
 */
class IOStream extends Duplex {
  public options: DuplexOptions;
  public id: string;

  public socket: Socket | null = null;
  private readonly pushBuffer: PushFunction[] = [];
  private readonly writeBuffer: WriteFunction[] = [];

  private _readable: boolean = false;
  private _writable: boolean = false;

  /**
   * @api private
   */
  public constructor(options: DuplexOptions = {}) {
    super(options);
    this.options = options;

    this.id = uuid();
    this.socket = null;

    // default to *not* allowing half open sockets
    this.allowHalfOpen = options?.allowHalfOpen ?? false;

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
  public override destroy(): this {
    debug('destroy');

    if (this.destroyed) {
      debug('already destroyed');
      return this;
    }

    this.readable = false;
    // @ts-expect-error -- it is not readonly
    this.writable = false;

    if (this.socket) {
      debug('clean up');
      this.socket.cleanup(this.id);
      this.socket = null;
    }

    this.destroyed = true;
    return super.destroy();
  }

  /**
   * Local read
   *
   * @api private
   */
  public override _read(size: number): void {
    if (this.destroyed) {
      return;
    }

    if (this.pushBuffer.length) {
      // flush buffer and end if it exists.
      let push;
      while ((push = this.pushBuffer.shift())) {
        if (!push()) {
          break;
        }
      }
      return;
    }

    this._readable = true;

    // Go get data from remote stream
    // Calls ._onread remotely then ._onwrite locally
    this.socket?._read(this.id, size);
  }

  /**
   * Read from remote stream
   *
   * @api private
   */
  _onread() {
    const write = this.writeBuffer.shift();
    if (write) {
      write();
    } else {
      this._writable = true;
    }
  }

  /**
   * Write local data to remote stream
   * Calls remote ._onwrite
   *
   * @api private
   */
  public override _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    super._write(chunk, encoding, callback);
    const write: WriteFunction = (): void => {
      if (this.destroyed) {
        return;
      }

      this._writable = false;
      this.socket?._write(this.id, chunk, encoding, callback);
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
  _onwrite(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const push: PushFunction = (): boolean => {
      this._readable = false;
      const ret = this.push(chunk ?? '', encoding);
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
  public _end(): void {
    if (this.pushBuffer.length) {
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
  public _done(): boolean {
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
  public _onfinish = (): void => {
    debug('_onfinish');
    // Local socket just finished
    // send 'end' event to remote
    this.socket?._end(this.id);

    // @ts-expect-error
    this.writable = false;
    // @ts-expect-error
    this._writableState.ended = true;

    // @ts-expect-error
    if (!this.readable || this._readableState.ended) {
      debug('_onfinish: ended, destroy');
      this.destroy();
      return;
    }

    debug('_onfinish: not ended');

    if (!this.allowHalfOpen) {
      this.push(null);

      // just in case we're waiting for an EOF.
      // @ts-expect-error
      if (this.readable && !this._readableState.endEmitted) {
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
  private readonly _onend = (): void => {
    debug('_onend');
    this.readable = false;
    // @ts-expect-error
    this._readableState.ended = true;

    // @ts-expect-error
    if (!this.writable || this._writableState.finished) {
      debug('_onend');
      this.destroy();
      return;
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
  private readonly _onerror = (err: Error & { remote?: boolean }): void => {
    // check if the error came from remote stream.
    if (!err.remote && this.socket) {
      // notify the error to the corresponding remote stream.
      this.socket._error(this.id, err);
    }

    this.destroy();
  };
}

export = IOStream;
