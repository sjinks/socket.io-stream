const { equal, throws, ok } = require('node:assert');
const { after, describe, it, beforeEach, before } = require('node:test');
const { once } = require('node:events');
const { setTimeout: wait } = require('node:timers/promises');
const ss = require('../');
const parser = require('../lib/parser');
const { createServer } = require('./support/server');
const { client } = require('./support');

const PORT = 4001;

let server;
before(() => {
  server = createServer(PORT);
});

after(() => {
  server.close()
});

describe('socket.io-stream', function() {
  it('should expose values', function() {
    equal(ss.Buffer, Buffer);
    equal(typeof ss.Socket, 'function');
    equal(typeof ss.IOStream, 'function');
    equal(typeof ss.forceBase64, 'boolean');
  });

  it('should always return a same instance for a socket', function() {
    const socket = client(PORT, { autoConnect: false });
    equal(ss(socket), ss(socket));
  });

  it('should throw an error when resending a stream', function() {
    const socket = ss(client(PORT, { autoConnect: false }));
    const stream = ss.createStream();

    socket.emit('foo', stream);
    throws(() => socket.emit('bar', stream));
  });

  it('should throw an error when sending destroyed streams', function() {
    const socket = ss(client(PORT, { autoConnect: false }));
    const stream = ss.createStream();

    stream.destroy();
    throws(() => socket.emit('foo', stream));
  });

  describe('clean up', function() {
    let socket;
    let streams;
    beforeEach(function() {
      socket = ss(client(PORT, { autoConnect: false }));
      streams = () => Object.keys(socket.streams);
    });

    describe('local streams', function() {
      let stream;
      beforeEach(function() {
        stream = ss.createStream();
        socket.emit('foo', stream);
        equal(streams().length, 1)
      });

      it('should be cleaned up on error', function() {
        stream.emit('error', new Error());
        equal(streams().length, 0)
      });

      it('should be cleaned up on finish', async function() {
        stream.emit('finish');
        await once(stream, 'end');
        equal(streams().length, 0);
      });

      it('should be cleaned up on end', async function() {
        stream.emit('end');
        await wait(0);
        equal(streams().length, 0);
      });
    });

    describe('remote streams', function() {
      let stream;
      beforeEach(function() {
        return new Promise((resolve) => {
          socket.on('foo', function(streamIn) {
            equal(streams().length, 1);
            stream = streamIn;
            setImmediate(resolve);
          });

          const encoder = new parser.Encoder();
          socket.$emit('foo', encoder.encode(ss.createStream()));
        });
      });

      it('should be cleaned up on error', function() {
        stream.emit('error', new Error());
        equal(streams().length, 0)
      });

      it('should be cleaned up on finish', async function() {
        stream.emit('finish');
        await once(stream, 'end');
        equal(streams().length, 0);
      });

      it('should be cleaned up on end', async function() {
        stream.emit('end');
        await wait(0);
        equal(streams().length, 0);
      });
    });

    describe('when allowHalfOpen is enabled', function() {
      it('should clean up local streams only after both "finish" and "end" were called', function() {
        const stream = ss.createStream({ allowHalfOpen: true });
        socket.emit('foo', stream);
        equal(streams().length, 1)

        stream.emit('end');
        equal(streams().length, 1)

        stream.emit('finish');
        equal(streams().length, 0)
      });

      it('should clean up remote streams only after both "finish" and "end" were called', async function() {
        const promise = once(socket, 'foo');

        // emit a new stream event manually.
        const encoder = new parser.Encoder();
        socket.$emit('foo', encoder.encode(ss.createStream({ allowHalfOpen: true })));

        const [stream] = await promise;
        equal(streams().length, 1)

        stream.emit('end');
        equal(streams().length, 1)

        stream.emit('finish');
        equal(streams().length, 0)
      });
    });
  });

  // TODO: Don't know how to make socket.IO emit errors now (old way doesn't work any more)
  // describe('when socket.io has an error', function() {
  //   it.only('should propagate the error', function(done) {
  //     const sio = client(PORT, { autoConnect: false });
  //     const socket = ss(sio);
  //     socket.on('error', function(err) {
  //       expect(err).toStrictEqual(expect.any(Error));
  //       done();
  //     });
  //     sio.emit("error", new Error())
  //   });
  // });

  describe('when socket.io is disconnected', function() {
    let socket;
    let sio;
    let stream;
    beforeEach(async function() {
      sio = client(PORT);
      socket = ss(sio);
      const promise = once(sio, 'connect');
      stream = ss.createStream();
      socket.emit('foo', stream);
      await promise;
    });

    it('should destroy streams', async function() {
      const promise = once(stream, 'close');
      sio.disconnect();
      await promise;
      ok(stream.destroyed);
    });

    it('should trigger close event', async function() {
      const promise = once(stream, 'close');
      sio.disconnect();
      await promise;
    });

    it('should trigger error event', async function() {
      const promise = once(stream, 'error');
      sio.disconnect();
      const [err] = await promise;
      equal(err instanceof Error, true);
    });
  });
});
