import { EventEmitter } from 'events';
import { type DuplexOptions } from 'stream';
import IOStream from './iostream';

export interface StreamObject {
  $stream: string;
  options?: DuplexOptions;
}

export class Encoder extends EventEmitter {
  public encode(v: IOStream): StreamObject;
  public encode(v: unknown[]): unknown[];
  public encode(v: Record<string, unknown>): Record<string, unknown>;
  public encode(v: unknown): unknown;
  public encode(v: unknown): unknown {
    if (v instanceof IOStream) {
      return this.encodeStream(v);
    }

    if (Array.isArray(v)) {
      return this.encodeArray(v);
    }

    if (v && 'object' == typeof v) {
      return this.encodeObject(v as Record<string, unknown>);
    }

    return v;
  }

  public encodeStream(stream: IOStream): StreamObject {
    this.emit('stream', stream);

    // represent a stream in an object.
    const v = { $stream: stream.id } as StreamObject;
    if (stream.options) {
      v.options = stream.options;
    }

    return v;
  }

  public encodeArray(arr: unknown[]): unknown[] {
    const v = [];
    const len = arr.length;
    for (let i = 0; i < len; ++i) {
      v.push(this.encode(arr[i]));
    }

    return v;
  }

  public encodeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const v = {} as Record<string, unknown>;
    for (const k in obj) {
      if (Object.hasOwn(obj, k)) {
        v[k] = this.encode(obj[k]);
      }
    }

    return v;
  }
}

export class Decoder extends EventEmitter {
  public decode(v: StreamObject): IOStream;
  public decode(v: unknown[]): unknown[];
  public decode(v: Record<string, unknown>): Record<string, unknown>;
  public decode(v: unknown): unknown;
  public decode(v: unknown): unknown {
    if (v && 'object' === typeof v) {
      if ('$stream' in v && v.$stream) {
        return this.decodeStream(v as StreamObject);
      }

      if (!Array.isArray(v)) {
        return this.decodeObject(v as Record<string, unknown>);
      }
    }

    if (Array.isArray(v)) {
      return this.decodeArray(v);
    }

    return v;
  }

  public decodeStream(obj: StreamObject): IOStream {
    const stream = new IOStream(obj.options);
    stream.id = obj.$stream;
    this.emit('stream', stream);
    return stream;
  }

  public decodeArray(arr: unknown[]): unknown[] {
    const v = [];
    const len = arr.length;
    for (let i = 0; i < len; ++i) {
      v.push(this.decode(arr[i]));
    }

    return v;
  }

  public decodeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const v = {} as Record<string, unknown>;
    for (const k in obj) {
      if (Object.hasOwn(obj, k)) {
        v[k] = this.decode(obj[k]);
      }
    }

    return v;
  }
}
