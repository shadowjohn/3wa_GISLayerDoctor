self.FormatHelpers = {
  text(buffer, requested = 'auto') {
    if (requested !== 'auto') return new TextDecoder(requested, { fatal: true }).decode(buffer);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { return new TextDecoder('big5', { fatal: true }).decode(buffer); }
  },
  xml(text, root, warnings = []) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('不接受含 DTD／ENTITY 的 XML');
    const doc = new GISFormats.DOMParser({
      onError: (level, message) => {
        if (level === 'warning' && message === 'Unicode replacement character detected, source encoding issues?') {
          const warning = '來源文字已含 � 替代字元；仍可解析幾何，但部分文字可能已損壞，切換編碼無法還原。';
          if (!warnings.includes(warning)) warnings.push(warning);
          return;
        }
        throw new Error('XML 格式錯誤：' + message);
      }
    }).parseFromString(text, 'text/xml');
    if (doc.documentElement?.localName !== root) throw new Error('預期 ' + root + ' XML 文件');
    return doc;
  },
  table(name, label, rows, warnings = [], details = []) {
    const fields = [...new Set(rows.flatMap(row => Object.keys(row)))].slice(0, 20);
    return { name, summary: rows.length + ' ' + label, count: rows.length, types: [],
      bounds: null, fields, fieldCount: fields.length, warnings, details,
      preview: rows.slice(0, 5).map(row => fields.map(field => String(row[field] ?? '').slice(0, 500))) };
  },
  nodes(node, name) { return Array.from(node.getElementsByTagNameNS('*', name)); },
  child(node, name) {
    return Array.from(node.childNodes).find(child => child.localName === name)?.textContent.trim() || '';
  }
};
