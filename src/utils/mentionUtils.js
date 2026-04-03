/**
 * @param {string} text
 * @returns {string[]} Unique lowercase handles (without @)
 */
function extractMentionHandles(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const re = /@([a-zA-Z0-9_]{2,32})/g;
  const out = new Set();
  let m = re.exec(text);
  while (m !== null) {
    out.add(String(m[1]).toLowerCase());
    m = re.exec(text);
  }
  return [...out];
}

module.exports = { extractMentionHandles };
