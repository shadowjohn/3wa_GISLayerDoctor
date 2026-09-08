self.parseGeoJSON = (value, name, warnings = []) => {
  function geometry(g, depth = 0) {
    if (g === null) return;
    if (!g || depth > 32) throw new Error('GeoJSON 幾何資料無效或巢狀過深');
    if (g.type === 'GeometryCollection') {
      if (!Array.isArray(g.geometries)) throw new Error('缺少 geometries');
      g.geometries.forEach(item => geometry(item, depth + 1)); return;
    }
    const dimensions = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
    if (!Object.hasOwn(dimensions, g.type)) throw new Error('未知 GeoJSON 幾何類型');
    function coordinates(items, level) {
      if (!Array.isArray(items)) throw new Error('coordinates 必須為陣列');
      if (level) { items.forEach(item => coordinates(item, level - 1)); return; }
      if (items.length < 2 || !items.every(Number.isFinite)) throw new Error('座標必須含至少兩個有限數值');
    }
    coordinates(g.coordinates, dimensions[g.type]);
  }
  let collection;
  if (value?.type === 'FeatureCollection') collection = value;
  else if (value?.type === 'Feature') collection = { type: 'FeatureCollection', features: [value] };
  else if (value?.type) collection = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: value, properties: {} }] };
  else throw new Error('不是 GeoJSON 文件');
  if (!Array.isArray(collection.features)) throw new Error('缺少 features');
  for (const feature of collection.features) {
    if (feature?.type !== 'Feature' || !Object.hasOwn(feature, 'geometry')) throw new Error('無效 Feature');
    if (feature.properties != null && (typeof feature.properties !== 'object' || Array.isArray(feature.properties))) throw new Error('properties 必須為物件或 null');
    geometry(feature.geometry);
  }
  if (value.crs) warnings.push('含舊版 crs 宣告；目前保留原始座標，未作轉換。');
  const result = LayerNormalizer.summarize(collection, name, warnings);
  result.coordinateLabel = value.crs ? '來源座標（含舊版 CRS 宣告）' : '解析座標（格式採 WGS84 經緯度）';
  if (value.crs) result.sourceCRS = JSON.stringify(value.crs);
  if (result.mapData) result.mapData.crs = value.crs ? null : 'EPSG:4326';
  return result;
};
