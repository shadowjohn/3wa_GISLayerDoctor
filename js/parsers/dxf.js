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
  })), ['保留 CAD 座標；圖台繪製支援的基本幾何，BLOCK／INSERT 尚未展開。'],
  ['版本：' + (doc.header?.$ACADVER || '未提供'), '單位代碼 $INSUNITS：' + (doc.header?.$INSUNITS ?? '未提供'),
   '實體類型：' + [...types].map(([type, count]) => type + ' ' + count).join('、')]);
  if (self.includeMap) {
    const features = []; let skipped = 0;
    for (const entity of doc.entities) {
      let geometry = null;
      const xy = point => [point.x, point.y];
      if (entity.type === 'POINT' && entity.position) geometry = { type: 'Point', coordinates: xy(entity.position) };
      else if (['LINE', 'LWPOLYLINE', 'POLYLINE'].includes(entity.type) && entity.vertices?.length > 1 && !entity.vertices.some(v => v.bulge)) {
        const coordinates = entity.vertices.map(xy);
        if (entity.shape && coordinates.length >= 3) { coordinates.push(coordinates[0]); geometry = { type: 'Polygon', coordinates: [coordinates] }; }
        else geometry = { type: 'LineString', coordinates };
      } else if (['CIRCLE', 'ARC'].includes(entity.type) && entity.center && entity.radius > 0) {
        const start = entity.type === 'CIRCLE' ? 0 : entity.startAngle;
        let end = entity.type === 'CIRCLE' ? Math.PI * 2 : entity.endAngle;
        while (end <= start) end += Math.PI * 2;
        const coordinates = Array.from({ length: 65 }, (_, i) => {
          const angle = start + (end - start) * i / 64;
          return [entity.center.x + entity.radius * Math.cos(angle), entity.center.y + entity.radius * Math.sin(angle)];
        });
        geometry = { type: 'LineString', coordinates };
      }
      if (geometry) features.push({ type: 'Feature', geometry, properties: { type: entity.type, layer: entity.layer, handle: entity.handle } });
      else skipped++;
    }
    const spatial = LayerNormalizer.summarize({ type: 'FeatureCollection', features }, file.name, []);
    result.mapData = spatial.mapData;
    result.bounds = spatial.bounds;
    result.coordinateSamples = spatial.coordinateSamples;
    result.coordinateLabel = 'CAD 原始座標（僅支援的幾何，未宣告 CRS）';
    result.warnings.push('圖台支援點、直線、多段線及 64 段近似圓弧；略過 ' + skipped + ' 個其他實體（含 BLOCK/INSERT、bulge）。請指定 CAD 來源座標系統。');
  }
  return result;
};
