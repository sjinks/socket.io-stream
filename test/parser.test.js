const { deepEqual, equal } = require('node:assert/strict');
const { once } = require('node:events');
const { describe, it } = require('node:test');
const ss = require('..');
const parser = require('../lib/parser');

describe('parser', function() {
  it('should encode/decode a stream', function() {
    const encoder = new parser.Encoder();
    const decoder = new parser.Decoder();
    const stream = ss.createStream();
    const result = decoder.decode(encoder.encode(stream));
    equal(result instanceof ss.IOStream, true);
  });

  it('should keep stream options', function() {
    const options = { highWaterMark: 10, objectMode: true, allowHalfOpen: true };
    const encoder = new parser.Encoder();
    const decoder = new parser.Decoder();
    const stream = ss.createStream(options)
    const result = decoder.decode(encoder.encode(stream));
    deepEqual(result.options, options);
  });

  it('should encode/decode every streams', function() {
    const encoder = new parser.Encoder();
    const decoder = new parser.Decoder();
    const result = decoder.decode(encoder.encode([
      ss.createStream(),
      { foo: ss.createStream() }
    ]));

    equal(result.length, 2);
    equal(result[0] instanceof ss.IOStream, true);
    equal(result[1].foo instanceof ss.IOStream, true);
  });

  it('should keep non-stream values', function() {
    const encoder = new parser.Encoder();
    const decoder = new parser.Decoder();
    const data = [1, 'foo', { foo: 'bar' }, null, undefined];
    const result = decoder.decode(encoder.encode(data));
    deepEqual(result, data);
  });

  describe('Encoder', function() {
    it('should fire stream event', async function() {
      const encoder = new parser.Encoder();
      const stream = ss.createStream();
      const promise = once(encoder, 'stream');
      encoder.encode(stream);
      const [s] = await promise;
      equal(s, stream);
    });
  });

  describe('Decoder', function() {
    it('should fire stream event', async function() {
      const encoder = new parser.Encoder();
      const decoder = new parser.Decoder();
      const promise = once(decoder, 'stream');
      const decoded = decoder.decode(encoder.encode(ss.createStream()));
      const [stream] = await promise;
      equal(stream, decoded);
    });
  });
});
