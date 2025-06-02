// UUID function from https://gist.github.com/jed/982883
// More lightweight than node-uuid

/**
 * Generate a UUID v4 string
 * @param {*} [a] - placeholder for recursion
 * @returns {string} UUID string
 */
function generateUUID(a) {
  return a           // if the placeholder was passed, return
    ? (              // a random number from 0 to 15
      a ^            // unless b is 8,
      Math.random()  // in which case
      * 16           // a random number from
      >> a/4         // 8 to 11
      ).toString(16) // in hexadecimal
    : '10000000-1000-4000-80000000-100000000000'.replace(/[018]/g, generateUUID);
}

module.exports = generateUUID;
