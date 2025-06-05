import { Readable, type ReadableOptions } from 'stream';

export interface BlobReadStreamOptions extends ReadableOptions{
  synchronous?: boolean;
}

/**
 * Readable stream for Blob and File on browser.
 */
export default class BlobReadStream extends Readable {
  private readonly blob: Blob;
  private start = 0;
  private readonly sync: boolean;
  private readonly fileReader: FileReader | FileReaderSync;

  /**
   * @api private
   */
  public constructor(blob: Blob, options: BlobReadStreamOptions = {}) {
    // Extract stream-specific options from options object
    const { synchronous, ...streamOptions } = options;
    super(streamOptions);

    this.blob = blob;
    this.start = 0;
    this.sync = synchronous || false;

    // Initialize FileReader based on sync preference
    if (this.sync && typeof window !== 'undefined' && window.FileReaderSync) {
      this.fileReader = new window.FileReaderSync();
    } else {
      this.fileReader = new FileReader();
      this.sync = false; // Force async if sync not available

      this.fileReader.addEventListener('load', this._onload);
      this.fileReader.addEventListener('error', this._onerror);
    }
  }

  /**
   * Read implementation for Readable stream
   *
   * @api private
   */
  public override _read(size: number): void {
    const start = this.start;
    const end = this.start = this.start + size;
    const chunk = this.blob.slice(start, end);

    if (chunk.size) {
      if (this.sync) {
        const result = (this.fileReader as FileReaderSync).readAsArrayBuffer(chunk);
        const bufferChunk = Buffer.from(new Uint8Array(result));
        this.push(bufferChunk);
      } else {
        this.fileReader.readAsArrayBuffer(chunk);
      }
    } else {
      this.push(null);
    }
  }

  /**
   * Handle FileReader load event
   *
   * @api private
   */
  private readonly _onload = (e: ProgressEvent<FileReader>): void => {
    if (e.target && e.target.result instanceof ArrayBuffer) {
      const chunk = Buffer.from(new Uint8Array(e.target.result));
      this.push(chunk);
    }
  }

  /**
   * Handle FileReader error event
   *
   * @api private
   */
  private readonly _onerror = (e: ProgressEvent<FileReader>): void => {
    if (e.target?.error) {
      this.emit('error', e.target.error);
    }
  }
}
