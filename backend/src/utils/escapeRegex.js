/**
 * Escape a user-supplied string so it can be used inside a RegExp literally.
 * Prevents regex injection and catastrophic backtracking from search inputs.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = escapeRegex;
