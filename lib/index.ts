import { Socket as SocketIOServerSocket } from 'socket.io';
import { Socket as SocketIOClientSocket } from 'socket.io-client';
import Socket, { SocketOptions } from './socket';
import IOStream from './iostream';
import BlobReadStream, { type BlobReadStreamOptions } from './blob-read-stream';
import { DuplexOptions } from 'stream';

interface ModuleExports {
  (sio: (SocketIOServerSocket | SocketIOClientSocket) & { _streamSocket?: Socket }, options?: SocketOptions ): Socket;
  Buffer: typeof Buffer;
  Socket: typeof Socket;
  IOStream: typeof IOStream;
  forceBase64: boolean;
  createStream: (options?: DuplexOptions) => IOStream;
  createBlobReadStream: (blob: Blob, options?: BlobReadStreamOptions) => BlobReadStream;
}

/**
 * Look up an existing Socket.
 */
function lookup(sio: (SocketIOServerSocket | SocketIOClientSocket) & { _streamSocket?: Socket }, options: SocketOptions = {}): Socket {
  options.forceBase64 ??= moduleExports.forceBase64;

  sio._streamSocket ??= new Socket(sio, options);
  return sio._streamSocket;
}

function createStream(options?: DuplexOptions): IOStream {
  return new IOStream(options);
}

function createBlobReadStream(blob: Blob, options?: { synchronous?: boolean }): BlobReadStream {
  return new BlobReadStream(blob, options);
}

const moduleExports: ModuleExports = Object.assign(lookup, {
  Buffer,
  Socket,
  IOStream,
  forceBase64: false,
  createStream,
  createBlobReadStream
});

export = moduleExports;
