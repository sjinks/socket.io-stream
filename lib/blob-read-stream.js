const { Readable } = require('stream');

/**
 * Readable stream for Blob and File on browser.
 */
class BlobReadStream extends Readable {
  /**
   * @param {Blob} blob - Blob or File object
   * @param {Object} [options] - Stream options
   * @param {boolean} [options.synchronous] - Use synchronous FileReader
   * @api private
   */
  constructor(blob, options = {}) {
    // Extract stream-specific options from options object
    const { synchronous, ...streamOptions } = options;
    super(streamOptions);

    this.blob = blob;
    this.start = 0;
    this.sync = synchronous || false;

    // Initialize FileReader based on sync preference
    if (this.sync && typeof window !== 'undefined' && 'FileReaderSync' in window && window.FileReaderSync) {
      // @ts-expect-error
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
   * @param {number} size - Size to read
   * @api private
   */
  _read(size) {
    const start = this.start;
    const end = this.start = this.start + size;
    const chunk = this.blob.slice(start, end);

    if (chunk.size) {
      if (this.sync) {
        const result = this.fileReader.readAsArrayBuffer(chunk);
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
   * @param {ProgressEvent<FileReader>} e - Load event
   * @api private
   */
  _onload = (e) => {
    if (e.target?.result instanceof ArrayBuffer) {
      const chunk = Buffer.from(new Uint8Array(e.target.result));
      this.push(chunk);
    }
  };

  /**
   * Handle FileReader error event
   *
   * @param {ProgressEvent<FileReader>} e - Error event
   * @api private
   */
  _onerror = (e) => {
    if (e.target?.error) {
      this.emit('error', e.target.error);
    }
  }
}

module.exports = BlobReadStream;
