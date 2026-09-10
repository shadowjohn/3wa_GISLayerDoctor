self.parseWMTS = async source => {
  const raw = source.trim();
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('WMTS 網址必須為 HTTP(S)，不可含帳密');
  const templateTile = raw.match(/\/(\$?\{z\})\/(\$?\{x\})\/(\$?\{y\})\.(png|jpe?g|webp)(?=[?#]|$)/i);
  if (templateTile) {
    const template = raw.replace(templateTile[0], '/{z}/{x}/{y}.' + templateTile[4]);
    const name = decodeURIComponent(url.pathname.split('/').at(-5) || url.hostname);
    const result = FormatHelpers.table(name, '筆 XYZ 圖磚服務', [{ 範本: template }],
      ['已使用 z/x/y XYZ 範本；不讀取 GetCapabilities。'], ['圖磚格式：' + templateTile[4].toUpperCase()]);
    if (self.includeMap) result.mapData = { kind: 'xyz', url: template };
    return [result];
  }
  const tile = url.pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.(png|jpe?g|webp)$/i);
  if (tile) {
    const template = url.href.replace(tile[0], '/{z}/{x}/{y}.' + tile[4]);
    const name = decodeURIComponent(url.pathname.split('/').at(-4) || url.hostname);
    const result = FormatHelpers.table(name, '筆 XYZ 圖磚服務', [{ 範本: template, 範例圖磚: url.href, Zoom: tile[1], X: tile[2], Y: tile[3] }],
      ['已由單張 z/x/y 圖磚網址建立 XYZ 範本；不讀取 GetCapabilities。'], ['圖磚格式：' + tile[4].toUpperCase()]);
    if (self.includeMap) result.mapData = { kind: 'xyz', url: template };
    return [result];
  }
  // Preserve explicit capabilities document URLs; complete only the KVP parameters already present.
  const names = [...url.searchParams.keys()];
  if (names.some(key => /^(service|request)$/i.test(key))) {
    for (const key of names) if (/^(service|request|version)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.set('SERVICE', 'WMTS'); url.searchParams.set('REQUEST', 'GetCapabilities'); url.searchParams.set('VERSION', '1.0.0');
  }
  let response;
  try { response = await fetch(url.href, { credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch { throw new Error('無法讀取 WMTS：請確認網路、HTTPS 及服務是否允許 CORS。'); }
  if (!response.ok) throw new Error('WMTS HTTP ' + response.status);
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new Error('WMTS 回應超過 5 MB'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; });
  const xmlWarnings = [];
  const doc = FormatHelpers.xml(FormatHelpers.text(bytes), 'Capabilities', xmlWarnings);
  const { nodes, child } = FormatHelpers;
  const layers = nodes(doc, 'Layer');
  if (!layers.length || !nodes(doc, 'TileMatrixSet').length) throw new Error('回應不是有效 WMTS capabilities（缺少圖層／矩陣集）');
  return layers.map(layer => {
    const result = FormatHelpers.table(child(layer, 'Title') || child(layer, 'Identifier'), '筆服務圖層資訊', [{
    Identifier: child(layer, 'Identifier'),
    Format: nodes(layer, 'Format').map(n => n.textContent.trim()).join(', '),
    Style: nodes(layer, 'Style').map(n => child(n, 'Identifier')).join(', '),
    TileMatrixSet: nodes(layer, 'TileMatrixSetLink').map(n => child(n, 'TileMatrixSet')).join(', ')
  }], ['已讀取 GetCapabilities；圖台勾選圖層後會向服務請求圖磚。', ...xmlWarnings], ['WMTS 版本：' + doc.documentElement.getAttribute('version')]);
    if (self.includeMap) result.mapData = { kind: 'wmts', url: url.href, layer: child(layer, 'Identifier') };
    return result;
  });
};
