self.parseDXF = async (file, encoding) => {
  const text = FormatHelpers.text(await file.arrayBuffer(), encoding);
  if (text.startsWith('AutoCAD Binary DXF')) throw new Error('目前支援文字 DXF，請先另存為 ASCII DXF');
  if (!/\bSECTION\b/.test(text) || !/\bEOF\s*$/.test(text)) throw new Error('DXF 文件不完整');
  const doc = new DxfParser().parseSync(text);
  if (!Array.isArray(doc.entities)) throw new Error('DXF 缺少實體資料');
  const types = new Map();
  doc.entities.forEach(entity => types.set(entity.type, (types.get(entity.type) || 0) + 1));
  const result = FormatHelpers.table(file.name, '個 DXF 實體', doc.entities.map(entity => ({
    handle: entity.handle, type: entity.type, layer: entity.layer,
    text: entity.text || '', color: entity.color ?? '', vertices: entity.vertices?.length ?? ''
  })), [], ['版本：' + (doc.header?.$ACADVER || '未提供'), '單位代碼 $INSUNITS：' + (doc.header?.$INSUNITS ?? '未提供'),
    '實體類型：' + [...types].map(([type, count]) => type + ' ' + count).join('、'), 'BLOCK：' + Object.keys(doc.blocks || {}).length + ' 個']);
  if (!self.includeMap) return result;

  const warnings = [], features = [];
  let expandedInserts = 0, skipped = 0;
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const xy = point => [point.x, point.y];
  const apply = (point, transform) => [transform.a * point[0] + transform.c * point[1] + transform.e, transform.b * point[0] + transform.d * point[1] + transform.f];
  const combine = (parent, child) => ({
    a: parent.a * child.a + parent.c * child.b, b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d, d: parent.b * child.c + parent.d * child.d,
    e: parent.a * child.e + parent.c * child.f + parent.e, f: parent.b * child.e + parent.d * child.f + parent.f
  });
  function insertTransform(insert, block, column = 0, row = 0) {
    const angle = (Number(insert.rotation) || 0) * Math.PI / 180;
    const scaleX = Number(insert.xScale) || 1, scaleY = Number(insert.yScale) || 1;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const a = cos * scaleX, b = sin * scaleX, c = -sin * scaleY, d = cos * scaleY;
    const base = block.position || { x: 0, y: 0 };
    const position = insert.position || { x: 0, y: 0 };
    const x = position.x + column * (Number(insert.columnSpacing) || 0);
    const y = position.y + row * (Number(insert.rowSpacing) || 0);
    return { a, b, c, d, e: x - a * base.x - c * base.y, f: y - b * base.x - d * base.y };
  }
  function arc(start, end, bulge) {
    if (!bulge) return [start, end];
    const dx = end[0] - start[0], dy = end[1] - start[1], chord = Math.hypot(dx, dy);
    if (!chord) return [start];
    const sweep = 4 * Math.atan(bulge);
    const middle = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const distance = chord * (1 - bulge * bulge) / (4 * bulge);
    const center = [middle[0] - dy / chord * distance, middle[1] + dx / chord * distance];
    const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
    const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
    return Array.from({ length: steps + 1 }, (_, index) => {
      const angle = startAngle + sweep * index / steps;
      return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
    });
  }
  function polyline(vertices, closed) {
    const coordinates = [];
    const count = closed ? vertices.length : vertices.length - 1;
    for (let index = 0; index < count; index++) {
      const start = xy(vertices[index]), end = xy(vertices[(index + 1) % vertices.length]);
      const points = arc(start, end, Number(vertices[index].bulge) || 0);
      coordinates.push(...(index ? points.slice(1) : points));
    }
    return coordinates;
  }
  function circle(entity) {
    const start = entity.type === 'CIRCLE' ? 0 : Number(entity.startAngle) || 0;
    let end = entity.type === 'CIRCLE' ? Math.PI * 2 : Number(entity.endAngle) || 0;
    while (end <= start) end += Math.PI * 2;
    return Array.from({ length: 65 }, (_, index) => {
      const angle = start + (end - start) * index / 64;
      return [entity.center.x + entity.radius * Math.cos(angle), entity.center.y + entity.radius * Math.sin(angle)];
    });
  }
  function addFeature(entity, transform, context) {
    let geometry = null;
    if (entity.type === 'POINT' && entity.position) geometry = { type: 'Point', coordinates: apply(xy(entity.position), transform) };
    else if (entity.type === 'LINE' && entity.startPoint && entity.endPoint) geometry = { type: 'LineString', coordinates: [xy(entity.startPoint), xy(entity.endPoint)].map(point => apply(point, transform)) };
    else if (['LWPOLYLINE', 'POLYLINE'].includes(entity.type) && entity.vertices?.length > 1) {
      const coordinates = polyline(entity.vertices, entity.shape).map(point => apply(point, transform));
      geometry = entity.shape && coordinates.length >= 4 ? { type: 'Polygon', coordinates: [coordinates] } : { type: 'LineString', coordinates };
    } else if (['CIRCLE', 'ARC'].includes(entity.type) && entity.center && entity.radius > 0) geometry = { type: 'LineString', coordinates: circle(entity).map(point => apply(point, transform)) };
    if (!geometry) { skipped++; return; }
    features.push({ type: 'Feature', geometry, properties: {
      type: entity.type, layer: entity.layer || context.layer || '', handle: entity.handle,
      block: context.block || '', insert: context.insert || ''
    } });
  }
  function expand(entity, transform = identity, context = {}, stack = []) {
    if (entity.type !== 'INSERT') { addFeature(entity, transform, context); return; }
    const block = doc.blocks?.[entity.name];
    if (!block?.entities) { skipped++; warnings.push('找不到 INSERT 參照的 BLOCK：' + (entity.name || '未命名')); return; }
    if (stack.includes(entity.name) || stack.length >= 16) { skipped++; warnings.push('略過遞迴或過深的 BLOCK：' + entity.name); return; }
    const columns = Math.max(1, Number(entity.columnCount) || 1), rows = Math.max(1, Number(entity.rowCount) || 1);
    for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
      const child = combine(transform, insertTransform(entity, block, column, row));
      for (const member of block.entities) expand(member, child, { layer: entity.layer || context.layer, block: entity.name, insert: entity.handle }, [...stack, entity.name]);
      expandedInserts++;
    }
  }
  doc.entities.forEach(entity => expand(entity));
  const spatial = LayerNormalizer.summarize({ type: 'FeatureCollection', features }, file.name, warnings);
  result.mapData = spatial.mapData;
  if (result.mapData) result.mapData.crs = null;
  result.bounds = spatial.bounds;
  result.coordinateSamples = spatial.coordinateSamples;
  result.coordinateLabel = 'CAD 原始座標（未宣告 CRS）';
  result.details.push('圖台幾何：' + features.length + ' 筆；展開 INSERT：' + expandedInserts + ' 次；略過：' + skipped + ' 個不支援實體。');
  result.warnings.push(...warnings, '圖台已展開 BLOCK／INSERT（含縮放、旋轉、陣列插入）與 bulge 圓弧；請指定 CAD 來源座標系統。');
  return result;
};
