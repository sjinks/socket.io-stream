const { EventEmitter } = require('events');
const IOStream = require('./iostream');

class Encoder extends EventEmitter {
  encode(v) {
    if (v instanceof IOStream) {
      return this.encodeStream(v);
    }

    if (Array.isArray(v)) {
      return this.encodeArray(v);
    }

    if (v && 'object' == typeof v) {
      return this.encodeObject(v);
    }

    return v;
  }

  /**
   * @param {IOStream} stream
   */
  encodeStream(stream) {
    this.emit('stream', stream);

    // represent a stream in an object.
    const v = { $stream: stream.id };
    if (stream.options) {
      v.options = stream.options;
    }

    return v;
  }

  /**
   * @param {Array} arr
   * @return {Array}
   */
  encodeArray(arr) {
    const v = [];
    const len = arr.length;
    for (let i = 0; i < len; ++i) {
      v.push(this.encode(arr[i]));
    }

    return v;
  }

  /**
   * @param {Object} obj
   * @return {Object}
   */
  encodeObject(obj) {
    const v = {};
    for (const k in obj) {
      if (Object.hasOwn(obj, k)) {
        v[k] = this.encode(obj[k]);
      }
    }

    return v;
  }
}

class Decoder extends EventEmitter {
  /**
   * @param {unknown} v
   */
  decode(v) {
    if (v && 'object' === typeof v && '$stream' in v && v.$stream) {
      return this.decodeStream(v);
    }

    if (Array.isArray(v)) {
      return this.decodeArray(v);
    }

    if (v && 'object' == typeof v) {
      return this.decodeObject(v);
    }

    return v;
  }

  /**
   * @param {Object} obj
   * @return {IOStream}
   */
  decodeStream(obj) {
    const stream = new IOStream(obj.options);
    stream.id = obj.$stream;
    this.emit('stream', stream);
    return stream;
  }

  /**
   * @param {Array} arr
   * @return {Array}
   */
  decodeArray(arr) {
    const v = [];
    const len = arr.length;
    for (let i = 0; i < len; ++i) {
      v.push(this.decode(arr[i]));
    }

    return v;
  }

  /**
   * @param {Object} obj
   * @return {Object}
   */
  decodeObject(obj) {
    const v = {};
    for (const k in obj) {
      if (Object.hasOwn(obj, k)) {
        v[k] = this.decode(obj[k]);
      }
    }

    return v;
  }
}

exports.Encoder = Encoder;
exports.Decoder = Decoder;
