const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads/commissions');

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return '.png';
  if (m.includes('webp')) return '.webp';
  if (m.includes('gif')) return '.gif';
  return '.jpg';
}

/**
 * @param {number} commissionId
 * @param {Array<{ mimeType?: string, dataBase64?: string }>} parts
 * @returns {string[]} paths like /uploads/commissions/12/abc.jpg
 */
function saveSubmissionImages(commissionId, parts) {
  if (!Array.isArray(parts) || parts.length === 0) return [];
  const cid = Number(commissionId);
  if (!Number.isFinite(cid) || cid <= 0) return [];

  const dir = path.join(UPLOAD_ROOT, String(cid));
  fs.mkdirSync(dir, { recursive: true });

  const urls = [];
  for (const part of parts) {
    const mime = String(part?.mimeType || part?.mime || 'image/jpeg');
    let b64 = String(part?.dataBase64 || part?.data || '');
    const dataUrl = /^data:image\/\w+;base64,/.test(b64);
    if (dataUrl) {
      b64 = b64.replace(/^data:image\/\w+;base64,/, '');
    }
    b64 = b64.replace(/\s/g, '');
    if (!b64) continue;
    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      continue;
    }
    if (buf.length < 32 || buf.length > 12 * 1024 * 1024) continue;

    const name = `${crypto.randomBytes(12).toString('hex')}${extFromMime(mime)}`;
    const full = path.join(dir, name);
    fs.writeFileSync(full, buf);
    urls.push(`/uploads/commissions/${cid}/${name}`);
  }
  return urls;
}

module.exports = { saveSubmissionImages, UPLOAD_ROOT };
