function generateUUID(a?: string | undefined): string {
  return a           // if the placeholder was passed, return
    ? (              // a random number from 0 to 15
      +a ^            // unless b is 8,
      Math.random()  // in which case
      * 16           // a random number from
      >> +a/4         // 8 to 11
      ).toString(16) // in hexadecimal
    : '10000000-1000-4000-80000000-100000000000'.replace(/[018]/g, generateUUID);
}

export = generateUUID;
