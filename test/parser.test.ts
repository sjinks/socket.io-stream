import { deepEqual, equal } from 'node:assert/strict';
import { once } from 'node:events';
import { beforeEach, describe, it } from 'node:test';
import * as ss from '../lib/index';
import { Decoder, Encoder } from '../lib/parser';

describe('parser', function() {
  let encoder: Encoder;
  let decoder: Decoder;

  beforeEach(() => {
    encoder = new Encoder();
    decoder = new Decoder();
  });

  it('should encode/decode a stream', function() {
    const stream = ss.createStream();
    const result = decoder.decode(encoder.encode(stream));
    equal(result instanceof ss.IOStream, true);
  });

  it('should keep stream options', function() {
    const options = { highWaterMark: 10, objectMode: true, allowHalfOpen: true };
    const stream = ss.createStream(options)
    const result = decoder.decode(encoder.encode(stream));
    deepEqual(result.options, options);
  });

  it('should encode/decode every streams', function() {
    const result = decoder.decode(encoder.encode([
      ss.createStream(),
      { foo: ss.createStream() }
    ]));

    equal(result.length, 2);
    equal(result[0] instanceof ss.IOStream, true);
    equal(typeof result[1], 'object');
    equal((result[1] as Record<string, unknown>)['foo'] instanceof ss.IOStream, true);
  });

  it('should keep non-stream values', function() {
    const data = [1, 'foo', { foo: 'bar' }, null, undefined];
    const result = decoder.decode(encoder.encode(data));
    deepEqual(result, data);
  });

  describe('Encoder', function() {
    it('should fire stream event', async function() {
      const stream = ss.createStream();
      const promise = once(encoder, 'stream');
      encoder.encode(stream);
      const [s] = await promise;
      equal(s, stream);
    });
  });

  describe('Decoder', function() {
    it('should fire stream event', async function() {
      const promise = once(decoder, 'stream');
      const decoded = decoder.decode(encoder.encode(ss.createStream()));
      const [stream] = await promise;
      equal(stream, decoded);
    });
  });
});
