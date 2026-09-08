(function (root) {
  'use strict';
  function choose(buffer, cpg, requested = 'auto') {
    if (!['auto', 'utf-8', 'big5'].includes(requested)) throw new Error('不支援的編碼選項');
    if (requested !== 'auto') return { encoding: requested, source: '手動指定' };
    if (cpg) {
      let label = new TextDecoder().decode(cpg).replace(/^\uFEFF/, '').replace(/\0/g, '').trim();
      if (/^(65001|utf[-_ ]?8)$/i.test(label)) label = 'utf-8';
      if (/^(950|cp950|big[-_ ]?5|ansi\s*950)$/i.test(label)) label = 'big5';
      try {
        return { encoding: new TextDecoder(label).encoding, source: '.cpg 宣告' };
      } catch { throw new Error('無法辨識 .cpg 編碼「' + label + '」，請手動選擇 UTF-8 或 Big5 後重新解析。'); }
    }
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    if (bytes.length < 33) throw new Error('DBF 標頭不完整');
    const count = view.getUint32(4, true);
    const header = view.getUint16(8, true);
    const length = view.getUint16(10, true);
    if (header < 33 || header > bytes.length || !length || header + count * length > bytes.length) {
      throw new Error('DBF 記錄長度不正確或檔案遭截斷');
    }
    const fields = [];
    let offset = 1;
    for (let pos = 32; pos + 32 <= header && bytes[pos] !== 13; pos += 32) {
      const size = bytes[pos + 16];
      if (offset + size > length) throw new Error('DBF 欄位長度不正確');
      if (bytes[pos + 11] === 67) fields.push({ offset, size });
      offset += size;
    }
    let utf8 = true, big5 = true, nonAscii = false;
    const utfDecoder = new TextDecoder('utf-8', { fatal: true });
    const bigDecoder = new TextDecoder('big5', { fatal: true });
    // ponytail: sample up to 256 evenly spaced records; mixed encodings need manual selection or source repair.
    const samples = Math.min(count, 256);
    for (let i = 0; i < samples; i++) {
      const row = samples === 1 ? 0 : Math.floor(i * (count - 1) / (samples - 1));
      const start = header + row * length;
      if (bytes[start] === 42) continue;
      for (const field of fields) {
        const value = bytes.subarray(start + field.offset, start + field.offset + field.size);
        if (!value.some(byte => byte >= 128)) continue;
        nonAscii = true;
        if (utf8) try { utfDecoder.decode(value); } catch { utf8 = false; }
        if (big5) try { bigDecoder.decode(value); } catch { big5 = false; }
      }
    }
    if (utf8) return { encoding: 'utf-8', source: nonAscii ? '自動抽樣：符合 UTF-8；如仍亂碼可手動切換' : '抽樣僅見 ASCII，暫用 UTF-8；無法據此確認中文編碼' };
    if (big5) return { encoding: 'big5', source: '自動抽樣：不符合 UTF-8，符合 Big5' };
    throw new Error('DBF 文字不符合 UTF-8 或 Big5，請確認來源編碼或手動指定後重試。');
  }
  root.DbfEncoding = { choose };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DbfEncoding;
})(globalThis);
