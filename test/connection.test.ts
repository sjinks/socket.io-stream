import { deepEqual, equal } from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it, before } from 'node:test';
import ss from '../lib/index';
import { client } from './support/index';
import { createServer } from './support/server';

const PORT = 4000;

describe('socket.io-stream', function() {
  let server: ReturnType<typeof createServer>;
  let socket: ReturnType<typeof client>;

  before(() => {
    server = createServer(PORT);
  });

  after(() => {
    server.close();
  });

  beforeEach(() => {
    socket = client(PORT);
  });

  afterEach(() => {
    socket.disconnect();
  });

  it('should send/receive a file', { timeout: 7000 }, function(_, done) {
    const sums: string[] = [];
    const check = (sum: string) => {
      console.log('check');
      sums.push(sum);
      if (sums.length < 2) {
        return;
      }

      equal(sums[0], sums[1]);
      done();
    };

    socket.on('connect', function() {
      console.log('connect');
      const file = ss.createStream();
      ss(socket).emit('read', file, 'test/support/frog.jpg', function(sum: string) {
        check(sum);
      });

      const checksum = ss.createStream();
      ss(socket).emit('checksum', checksum, function(sum: string) {
        check(sum);
      });

      file.pipe(checksum);
    });
  });

  it('should send/receive data in flowing mode', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      const stream = ss.createStream();
      const expectedObject = { hi: 1 };
      ss(socket)
        .emit('echo', stream, expectedObject)
        .on('echo', function(stream, obj) {
          deepEqual(obj, expectedObject);

          let data = '';
          stream.on('data', function(chunk) {
            data += chunk;
          }).on('end', function() {
            equal(data, 'foobar');
            socket.disconnect();
            done();
          });
        });

      stream.write('foo');
      stream.write('bar');
      stream.end();
    });
  });

  it('should send/receive data in paused mode', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      const stream = ss.createStream();
      const expectedObject = { hi: 1 };
      ss(socket)
        .emit('echo', stream, expectedObject)
        .on('echo', function(stream, obj) {
          deepEqual(obj, expectedObject);

          let data = '';
          stream.on('readable', function() {
            let chunk;
            while (null !== (chunk = stream.read())) {
              data += chunk;
            }
          }).on('end', function() {
            equal(data, 'foobar');
            socket.disconnect();
            done();
          });
        });

      stream.write('foo');
      stream.write('bar');
      stream.end();
    });
  });

  it('should send/receive Buffer', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      const stream = ss.createStream();
      ss(socket)
        .emit('echo', stream)
        .on('echo', function(stream) {
          const buffers = [];
          stream.on('data', function(chunk) {
            buffers.push(chunk);
          }).on('end', function() {
            const buffer = Buffer.concat(buffers);
            equal(buffer.length, 4);
            for (let i = 0; i < 4; i++) {
              equal(buffer[i], i);
            }
            socket.disconnect();
            done();
          });
        });

      stream.write(Buffer.from([0, 1]));
      stream.write(Buffer.from([2, 3]));
      stream.end();
    });
  });

  it('should send/receive an object in object mode', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      const stream = ss.createStream({ objectMode: true });
      ss(socket)
        .emit('echo', stream)
        .on('echo', function(stream) {
          const data = [];
          stream.on('data', function(chunk) {
            data.push(chunk);
          }).on('end', function() {
            equal(data.length, 2);
            deepEqual(data[0], { foo: 0 });
            deepEqual(data[1], { bar: 1 });
            socket.disconnect();
            done();
          });
        });

      stream.write({ foo: 0 });
      stream.write({ bar: 1 });
      stream.end();
    });
  });

  it('should send/receive streams in an array', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      ss(socket)
        .emit('echo', [ss.createStream(), ss.createStream()])
        .on('echo', function(data) {
          equal(data.length, 2);
          equal(data[0] instanceof ss.IOStream, true);
          equal(data[1] instanceof ss.IOStream, true);
          socket.disconnect();
          done();
        });
    });
  });

  it('should send/receive streams in an object', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      ss(socket)
        .emit('echo', {
          foo: ss.createStream(),
          bar: ss.createStream()
        })
        .on('echo', function(data) {
          equal(data.foo instanceof ss.IOStream, true);
          equal(data.bar instanceof ss.IOStream, true);
          socket.disconnect();
          done();
        });
    });
  });

  it('should send/receive data through a same stream', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      const stream = ss.createStream({ allowHalfOpen: true });
      ss(socket).emit('sendBack', stream);
      stream.write('foo');
      stream.write('bar');
      stream.end();

      let data = '';
      stream.on('data', function(chunk) {
        data += chunk;
      }).on('end', function() {
        equal(data, 'foobar');
        done();
      });
    });
  });

  it('should handle multiple streams', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      const stream1 = ss.createStream();
      const stream2 = ss.createStream();
      ss(socket).emit('multi', stream1, stream2);
      stream1.write('foo');
      stream1.write('bar');
      stream1.end();

      let data = '';
      stream2.on('data', function(chunk) {
        data += chunk;
      }).on('end', function() {
        equal(data, 'foobar');
        done();
      });
    });
  });

  it('should get a stream through ack', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      const stream = ss.createStream();
      ss(socket).emit('ack', stream, function(stream) {
        let data = '';
        stream.on('data', function(chunk) {
          data += chunk;
        }).on('end', function() {
          equal(data, 'foobar');
          socket.disconnect();
          done();
        });
      });

      stream.write('foo');
      stream.write('bar');
      stream.end();
    });
  });

  it('should get streams through ack as object and array', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      ss(socket).emit('ack', [ss.createStream(), { foo: ss.createStream() }], function(data) {
        equal(data.length, 2);
        equal(data[0] instanceof ss.IOStream, true);
        equal(data[1].foo instanceof ss.IOStream, true);
        done();
      });
    });
  });

  it('should send an error happened on the client', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      const stream = ss.createStream();
      ss(socket).emit('clientError', stream, function(msg) {
        equal(msg, 'error on the client');
        done();
      });
      stream.emit('error', new Error('error on the client'));
    });
  });

  it('should receive an error happened on the server', { timeout: 7000 }, function(_, done) {
    socket.on('connect', function() {
      const stream = ss.createStream();
      ss(socket).emit('serverError', stream, 'error on the server');
      stream.on('error', function(err) {
        equal(err.message, 'error on the server');
        done()
      });
    });
  });
});
