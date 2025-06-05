import { createHash, Hash } from 'node:crypto';
import { PassThrough, type TransformOptions } from 'node:stream';

export class Checksum extends PassThrough {
  private readonly hash: Hash;

  constructor(options: TransformOptions = {}) {
    super(options);
    this.hash = createHash('sha1');
    this.resume();
  }

  public override _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.hash.update(String(chunk), encoding);
    super._write(chunk, encoding, callback);
  }

  public digest(): string {
    return this.hash.digest('hex');
  }
}
