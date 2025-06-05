import { createReadStream } from 'node:fs';
import { Server } from 'socket.io';
import { Checksum } from './checksum';
import ss from '../../lib/index';
import IOStream from '../iostream';

export function createServer(port: number) {
  const server = new Server(port);
  server.on('connection', function(socket) {
    ss(socket).on('read', function(stream: IOStream, path: string, callback: (digest: string) => unknown) {
      console.log('onread');
      const file = createReadStream(__dirname + '/../../' + path);
      const checksum = new Checksum();
      file.pipe(checksum).pipe(stream).on('finish', function() {
        console.log('onread finish');
        callback(checksum.digest());
      });
    });

    ss(socket).on('checksum', function(stream: IOStream, callback: (digest: string) => unknown) {
      console.log('onchecksum');
      const checksum = new Checksum();
      stream.pipe(checksum).on('finish', function() {
        console.log('onchecksum finish');
        callback(checksum.digest());
      }).resume();
    });

    ss(socket).on('echo', function(...args: unknown[]): void {
      console.log('onecho');
      const s = ss(socket);
      s.emit('echo', ...echo(args) as unknown[]);
    });

    ss(socket).on('sendBack', function(...args: unknown[]): void {
      console.log('onsendBack');
      sendBack(args);
    });

    ss(socket).on('multi', function(stream1: IOStream, stream2: IOStream) {
      console.log('onmulti');
      stream1.pipe(stream2);
    });

    ss(socket).on('ack', function(this: Server, ...args: unknown[]): void {
      console.log('onack');
      const callback = args.pop();
      callback.apply(this, echo(args));
    });

    ss(socket).on('clientError', function(stream, callback) {
      console.log('onclientError');
      stream.on('error', function(err: Error) {
        callback(err.message);
      });
    });

    ss(socket).on('serverError', function(stream: IOStream, msg: string) {
      console.log('onserverError');
      stream.emit('error', new Error(msg));
    });
  });

  return server;
}

function echo(v: unknown): unknown {
  if (v instanceof ss.IOStream) {
    return v.pipe(ss.createStream(v.options));
  }

  if (Array.isArray(v)) {
    v = v.map((v) => echo(v));
  } else if (v && 'object' == typeof v) {
    for (const k in v) {
      if (Object.hasOwn(v, k)) {
        (v as Record<string, unknown>)[k] = echo((v as Record<string, unknown>)[k]);
      }
    }
  }

  return v;
}

function sendBack(v: unknown) {
  if (v instanceof ss.IOStream) {
    v.pipe(v);
    return;
  }

  if (Array.isArray(v)) {
    v.forEach(sendBack);
  } else if (v && 'object' == typeof v) {
    for (const k in v) {
      if (Object.hasOwn(v, k)) {
        sendBack((v as Record<string, unknown>)[k]);
      }
    }
  }
}
