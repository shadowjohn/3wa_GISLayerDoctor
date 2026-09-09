self.parseOpenDataXML = async (file, encoding) => {
  const warnings = [];
  const doc = FormatHelpers.xml(FormatHelpers.text(await file.arrayBuffer(), encoding), null, warnings);
  const childElements = node => Array.from(node.childNodes).filter(child => child.nodeType === 1);
  const flatten = (node, properties, path = '') => {
    const children = childElements(node), totals = {};
    children.forEach(child => { totals[child.localName] = (totals[child.localName] || 0) + 1; });
    const seen = {};
    for (const child of children) {
      const name = child.localName + (totals[child.localName] > 1 ? '[' + (seen[child.localName]++ || 0) + ']' : '');
      const key = path ? path + '.' + name : name;
      if (childElements(child).length) flatten(child, properties, key);
      else if (!(key in properties)) properties[key] = child.textContent.trim();
    }
  };
  const position = properties => {
    const value = names => Number(Object.entries(properties).find(([key]) => names.includes(key.split('.').at(-1).replace(/\[\d+\]$/, '').replace(/[\s_-]/g, '').toLowerCase()))?.[1]);
    const longitude = value(['longitude', 'lon', 'long', 'lng', '經度']);
    const latitude = value(['latitude', 'lat', 'latgitude', '緯度']);
    if (Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90) return { coordinates: [longitude, latitude], crs: 'EPSG:4326' };
    const x = value(['x']), y = value(['y']);
    return Number.isFinite(x) && Number.isFinite(y) ? { coordinates: [x, y], crs: null } : null;
  };
  if (doc.documentElement?.localName === 'cwaopendata') {
    warnings.push('依 CWA cwaopendata 站點結構讀取；優先使用 GeoInfo 中的 WGS84 座標。');
    const stations = FormatHelpers.nodes(doc, 'Station');
    const features = stations.flatMap(station => {
      const geoInfo = FormatHelpers.nodes(station, 'GeoInfo')[0];
      const coordinates = geoInfo ? FormatHelpers.nodes(geoInfo, 'Coordinates') : [];
      const wgs84 = coordinates.find(node => FormatHelpers.child(node, 'CoordinateName').toUpperCase() === 'WGS84');
      const latitude = Number(wgs84 ? FormatHelpers.child(wgs84, 'StationLatitude') : NaN);
      const longitude = Number(wgs84 ? FormatHelpers.child(wgs84, 'StationLongitude') : NaN);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
      const properties = { StationName: FormatHelpers.child(station, 'StationName'), StationId: FormatHelpers.child(station, 'StationId'),
        Maintainer: FormatHelpers.child(station, 'Maintainer'), ObsTime: FormatHelpers.child(FormatHelpers.nodes(station, 'ObsTime')[0], 'DateTime'),
        WGS84Latitude: latitude, WGS84Longitude: longitude };
      flatten(station, properties);
      return [{ type: 'Feature', geometry: { type: 'Point', coordinates: [longitude, latitude] }, properties }];
    });
    if (features.length) {
      const result = LayerNormalizer.summarize({ type: 'FeatureCollection', features }, file.name, warnings);
      if (result.mapData) { result.mapData.crs = 'EPSG:4326'; result.mapData.sourceCRSDeclared = true; }
      result.coordinateLabel = 'CWA WGS84 站點座標';
      result.sourceCRS = 'WGS84（GeoInfo / Coordinates / CoordinateName）';
      result.details = [['資料集', FormatHelpers.child(doc.documentElement, 'dataid')], ['發布時間', FormatHelpers.child(doc.documentElement, 'sent')]].filter(([, value]) => value).map(([label, value]) => label + '：' + value);
      return result;
    }
    warnings.push('CWA Station 找不到有效 WGS84 座標，改用通用 XML fallback。');
  }
  const groups = new Map();
  const collect = node => childElements(node).forEach(child => {
    if (childElements(child).length) {
      const rows = groups.get(child.localName) || [];
      rows.push(child); groups.set(child.localName, rows);
    }
    collect(child);
  });
  collect(doc.documentElement);
  const candidates = [...groups.entries()].filter(([, rows]) => rows.length > 1).sort((a, b) => b[1].length - a[1].length);
  if (!candidates.length) throw new Error('XML 找不到可作為資料列的重複標籤。');
  for (const [tag, rows] of candidates) {
    const records = rows.map(node => { const properties = {}; flatten(node, properties); return { properties, position: position(properties) }; });
    const geographic = records.filter(record => record.position?.crs);
    const points = geographic.length ? geographic : records.filter(record => record.position);
    if (!points.length) continue;
    const result = LayerNormalizer.summarize({ type: 'FeatureCollection', features: points.map(record => ({ type: 'Feature', geometry: { type: 'Point', coordinates: record.position.coordinates }, properties: record.properties })) }, file.name, warnings);
    result.details = ['通用 XML fallback：以重複的 <' + tag + '> 作為資料列（' + rows.length + ' 筆），符合座標 ' + points.length + ' 筆。'];
    if (geographic.length) {
      if (result.mapData) { result.mapData.crs = 'EPSG:4326'; result.mapData.sourceCRSDeclared = true; }
      result.coordinateLabel = 'XML 經緯度欄位（推定 WGS84）';
      result.sourceCRS = '由 longitude／latitude 等欄位名稱與合法數值範圍推定 EPSG:4326';
      result.warnings.push('通用 XML 座標由欄位名稱推定為 WGS84；套圖前請確認來源說明。');
    } else {
      result.coordinateLabel = 'XML 原始 X／Y 座標';
      result.sourceCRS = '由 X／Y 欄位辨識；CRS 未知';
      result.warnings.push('偵測到 X／Y 座標但無 CRS 宣告；請在左側指定資料來源座標系統後再套圖。');
    }
    return result;
  }
  const [tag, rows] = candidates[0];
  const result = LayerNormalizer.summarize({ type: 'FeatureCollection', features: rows.map(node => { const properties = {}; flatten(node, properties); return { type: 'Feature', geometry: null, properties }; }) }, file.name, warnings);
  result.mapData = null;
  result.details = ['通用 XML fallback：以重複的 <' + tag + '> 作為資料列（' + rows.length + ' 筆）。'];
  result.warnings.push('找不到可驗證的 longitude／latitude 或 X／Y 欄位，僅顯示屬性預覽，不套圖。');
  return result;
};
