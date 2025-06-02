const { createReadStream } = require('fs');
const { Server } = require('socket.io');
const Checksum = require('./checksum');
const ss = require('../../');

function createServer(port) {
  const server = new Server(port);
  server.on('connection', function(socket) {
    ss(socket).on('read', function(stream, path, callback) {
      const file = createReadStream(__dirname + '/../../' + path);
      const checksum = new Checksum();
      file.pipe(checksum).pipe(stream).on('finish', function() {
        callback(checksum.digest());
      });
    });

    ss(socket).on('checksum', function(stream, callback) {
      const checksum = new Checksum();
      stream.pipe(checksum).on('finish', function() {
        callback(checksum.digest());
      }).resume();
    });

    ss(socket).on('echo', function(...args) {
      const s = ss(socket);
      s.emit('echo', ...echo(args));
    });

    ss(socket).on('sendBack', function(...args) {
      sendBack(args);
    });

    ss(socket).on('multi', function(stream1, stream2) {
      stream1.pipe(stream2);
    });

    ss(socket).on('ack', function(...args) {
      const callback = args.pop();
      callback.apply(this, echo(args));
    });

    ss(socket).on('clientError', function(stream, callback) {
      stream.on('error', function(err) {
        callback(err.message);
      });
    });

    ss(socket).on('serverError', function(stream, msg) {
      stream.emit('error', new Error(msg));
    });
  });

  return server;
}

module.exports.createServer = createServer;

/**
 * @param {unknown} v
 * @returns {unknown}
 */
function echo(v) {
  if (v instanceof ss.IOStream) {
    return v.pipe(ss.createStream(v.options));
  }

  if (Array.isArray(v)) {
    v = v.map((v) => echo(v));
  } else if (v && 'object' == typeof v) {
    for (const k in v) {
      if (Object.hasOwn(v, k)) {
        v[k] = echo(v[k]);
      }
    }
  }
  return v;
}

/**
 * @param {unknown} v
 */
function sendBack(v) {
  if (v instanceof ss.IOStream) {
    return v.pipe(v);
  }

  if (Array.isArray(v)) {
    v.forEach(sendBack);
  } else if (v && 'object' == typeof v) {
    for (const k in v) {
      if (Object.hasOwn(v, k)) {
        sendBack(v[k]);
      }
    }
  }
}
