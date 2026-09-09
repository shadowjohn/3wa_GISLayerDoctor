(function (root) {
  'use strict';
  const compressedTypes = {
    1000002: [2, 2, false, false], 1000003: [3, 2, false, false],
    1001002: [2, 3, true, false], 1001003: [3, 3, true, false],
    1002002: [2, 3, false, true], 1002003: [3, 3, false, true],
    1003002: [2, 4, true, true], 1003003: [3, 4, true, true]
  };
  const names = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];
  const supportedMapCRS = new Set([3825, 3826, 3827, 3828, 3857, 4326]);

  function parseGeometryBlob(blob) {
    const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
    if (bytes.length < 8 || bytes[0] !== 0 || bytes.at(-1) !== 0xfe) throw new Error('不是有效的 SpatiaLite geometry BLOB');
    const tinyPoint = bytes[1] === 0x80 || bytes[1] === 0x81;
    const littleEndian = tinyPoint ? bytes[1] === 0x81 : bytes[1] === 1;
    if (!tinyPoint && bytes[1] !== 0 && bytes[1] !== 1) throw new Error('SpatiaLite geometry 的 endian 標記無效');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = bytes.length - 1;
    const need = (offset, length) => {
      if (offset < 0 || offset + length > end) throw new Error('SpatiaLite geometry 長度不足');
    };
    const integer = offset => { need(offset, 4); return view.getUint32(offset, littleEndian); };
    const decimal = offset => { need(offset, 8); return view.getFloat64(offset, littleEndian); };
    const count = offset => {
      const value = integer(offset);
      if (value > end - offset - 4) throw new Error('SpatiaLite geometry 的筆數無效');
      return [value, offset + 4];
    };
    const typeInfo = type => {
      if (Object.hasOwn(compressedTypes, type)) {
        const [base, dimensions, hasZ, hasM] = compressedTypes[type];
        return { base, dimensions, hasZ, hasM, compressed: true };
      }
      const dimensionality = Math.floor(type / 1000), base = type % 1000;
      if (base < 1 || base > 7 || dimensionality > 3) throw new Error('不支援的 SpatiaLite geometry 類型：' + type);
      return { base, dimensions: dimensionality === 0 ? 2 : dimensionality === 3 ? 4 : 3,
        hasZ: dimensionality === 1 || dimensionality === 3, hasM: dimensionality === 2 || dimensionality === 3, compressed: false };
    };
    const point = (offset, info) => {
      need(offset, info.dimensions * 8);
      const coordinates = Array.from({ length: info.dimensions }, (_, index) => decimal(offset + index * 8));
      if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) throw new Error('SpatiaLite geometry 含無效座標');
      return [coordinates, offset + info.dimensions * 8];
    };
    const compressedLine = (offset, info) => {
      let size; [size, offset] = count(offset);
      if (!size) return [[], offset];
      const coordinates = [], first = point(offset, info); offset = first[1]; coordinates.push(first[0]);
      const differentialSize = (info.hasZ ? 12 : 8) + (info.hasM ? 8 : 0);
      for (let index = 1; index < size - 1; index++) {
        need(offset, differentialSize);
        const previous = coordinates.at(-1), current = [previous[0] + view.getFloat32(offset, littleEndian), previous[1] + view.getFloat32(offset + 4, littleEndian)];
        offset += 8;
        if (info.hasZ) { current.push(previous[2] + view.getFloat32(offset, littleEndian)); offset += 4; }
        if (info.hasM) { current.push(decimal(offset)); offset += 8; }
        if (!Number.isFinite(current[0]) || !Number.isFinite(current[1])) throw new Error('SpatiaLite geometry 含無效座標');
        coordinates.push(current);
      }
      if (size > 1) { const last = point(offset, info); offset = last[1]; coordinates.push(last[0]); }
      return [coordinates, offset];
    };
    const line = (offset, info) => {
      if (info.compressed) return compressedLine(offset, info);
      let size; [size, offset] = count(offset);
      if (size > Math.floor((end - offset) / (info.dimensions * 8))) throw new Error('SpatiaLite geometry 的座標數量無效');
      const coordinates = [];
      for (let index = 0; index < size; index++) { const value = point(offset, info); offset = value[1]; coordinates.push(value[0]); }
      return [coordinates, offset];
    };
    const polygon = (offset, info) => {
      let size; [size, offset] = count(offset);
      const coordinates = [];
      for (let index = 0; index < size; index++) { const ring = line(offset, info); offset = ring[1]; coordinates.push(ring[0]); }
      return [coordinates, offset];
    };
    const geometry = (type, offset, depth = 0) => {
      if (depth > 64) throw new Error('SpatiaLite geometry 巢狀過深');
      const info = typeInfo(type);
      if (info.base === 1) { const value = point(offset, info); return [{ type: names[0], coordinates: value[0] }, value[1], info]; }
      if (info.base === 2) { const value = line(offset, info); return [{ type: names[1], coordinates: value[0] }, value[1], info]; }
      if (info.base === 3) { const value = polygon(offset, info); return [{ type: names[2], coordinates: value[0] }, value[1], info]; }
      let size; [size, offset] = count(offset);
      const expected = info.base === 4 ? 1 : info.base === 5 ? 2 : info.base === 6 ? 3 : null;
      const items = [];
      for (let index = 0; index < size; index++) {
        need(offset, 5);
        if (bytes[offset] !== 0x69) throw new Error('SpatiaLite geometry 缺少集合項目標記');
        const value = geometry(integer(offset + 1), offset + 5, depth + 1);
        if (expected && value[2].base !== expected) throw new Error('SpatiaLite geometry 集合類型不符');
        offset = value[1]; items.push(value[0]);
      }
      if (info.base === 7) return [{ type: names[6], geometries: items }, offset, info];
      return [{ type: names[info.base - 1], coordinates: items.map(item => item.coordinates) }, offset, info];
    };
    const srid = view.getInt32(2, littleEndian);
    if (tinyPoint) {
      const tinyType = bytes[6];
      if (tinyType < 1 || tinyType > 4) throw new Error('SpatiaLite TinyPoint 類型無效');
      const info = { dimensions: [2, 3, 3, 4][tinyType - 1] };
      const value = point(7, info);
      if (value[1] !== end) throw new Error('SpatiaLite TinyPoint 長度無效');
      return { geometry: { type: 'Point', coordinates: value[0] }, srid };
    }
    if (bytes.length < 60 || bytes[38] !== 0x7c) throw new Error('SpatiaLite geometry 缺少 MBR 標記');
    const value = geometry(integer(39), 43);
    if (value[1] !== end) throw new Error('SpatiaLite geometry 長度無效');
    return { geometry: value[0], srid };
  }

  function query(db, sql) {
    const result = db.exec(sql, { useBigInt: true })[0];
    return result || { columns: [], values: [] };
  }
  const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
  const column = (columns, names) => columns.findIndex(name => names.includes(String(name).toLowerCase()));
  const property = value => value instanceof Uint8Array ? '[BLOB ' + value.byteLength + ' bytes]' :
    typeof value === 'bigint' ? value.toString() : value;
  function spatialReference(db, srid) {
    if (!Number.isInteger(srid)) return '';
    try {
      const result = query(db, 'SELECT srtext, proj4text FROM spatial_ref_sys WHERE srid = ' + srid);
      return result.values[0]?.filter(Boolean).join('\n').slice(0, 5000) || '';
    } catch { return ''; }
  }
  async function parseSpatiaLite(file) {
    if (typeof root.initSqlJs !== 'function') throw new Error('SQLite WASM 載入失敗');
    const version = new URL(root.location.href).searchParams.get('v');
    const SQL = await root.initSqlJs({ locateFile: name => {
      const url = new URL('../vendor/' + name, root.location.href);
      return version ? url.href + '?v=' + encodeURIComponent(version) : url.href;
    }});
    let db;
    try {
      db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
      const metadata = query(db, 'SELECT * FROM geometry_columns');
      const tableIndex = column(metadata.columns, ['f_table_name', 'table_name']);
      const geometryIndex = column(metadata.columns, ['f_geometry_column', 'geometry_column', 'column_name']);
      const sridIndex = column(metadata.columns, ['srid']);
      if (tableIndex < 0 || geometryIndex < 0) throw new Error('找不到標準 SpatiaLite geometry_columns metadata');
      if (!metadata.values.length) throw new Error('SpatiaLite geometry_columns 沒有已註冊的圖層');
      const layers = [];
      for (const metadataRow of metadata.values) {
        const table = String(metadataRow[tableIndex]), geometryColumn = String(metadataRow[geometryIndex]);
        const data = query(db, 'SELECT * FROM ' + quote(table));
        const geometryPosition = data.columns.findIndex(name => String(name).toLowerCase() === geometryColumn.toLowerCase());
        if (geometryPosition < 0) throw new Error(table + ' 找不到 geometry 欄位 ' + geometryColumn);
        const features = [], warnings = [], srids = new Set();
        let empty = 0, invalid = 0;
        for (const row of data.values) {
          const blob = row[geometryPosition];
          if (blob == null) { empty++; continue; }
          try {
            const parsed = parseGeometryBlob(blob); srids.add(parsed.srid);
            const properties = Object.create(null);
            data.columns.forEach((name, index) => { if (index !== geometryPosition) properties[name] = property(row[index]); });
            features.push({ type: 'Feature', properties, geometry: parsed.geometry });
          } catch { invalid++; }
        }
        if (empty) warnings.push('略過 ' + empty + ' 筆空白 geometry。');
        if (invalid) warnings.push('略過 ' + invalid + ' 筆無法辨識的 SpatiaLite geometry。');
        const declaredSRID = sridIndex < 0 || metadataRow[sridIndex] == null ? null : Number(metadataRow[sridIndex]);
        const srid = srids.size === 1 ? [...srids][0] : Number.isInteger(declaredSRID) ? declaredSRID : null;
        if (srids.size > 1) warnings.push('同一幾何欄位含多個 SRID，暫不套圖。');
        if (srid != null && Number.isInteger(declaredSRID) && srid !== declaredSRID) warnings.push('geometry BLOB 的 SRID 與 geometry_columns metadata 不一致。');
        const layer = root.LayerNormalizer.summarize({ type: 'FeatureCollection', features }, file.name + ' · ' + table, warnings);
        layer.details = ['SpatiaLite 表格：' + table, '幾何欄位：' + geometryColumn + '；有效圖徵：' + features.length];
        layer.coordinateLabel = srid == null ? 'SpatiaLite 來源座標（SRID 未確認）' : 'SpatiaLite 來源座標（EPSG:' + srid + '）';
        const reference = spatialReference(db, srid);
        if (srid != null) layer.sourceCRS = 'EPSG:' + srid + (reference ? '\n' + reference : '');
        if (layer.mapData && srid != null) layer.mapData.sourceCRSDeclared = true;
        if (layer.mapData && srids.size <= 1 && supportedMapCRS.has(srid)) layer.mapData.crs = 'EPSG:' + srid;
        else if (srid != null) warnings.push('圖台目前未載入 EPSG:' + srid + ' 的投影定義，仍保留解析與屬性預覽。');
        layers.push(layer);
      }
      return layers;
    } catch (error) {
      if (/no such table: geometry_columns/i.test(error.message)) throw new Error('不是含 geometry_columns 的 SpatiaLite 資料庫');
      throw error;
    } finally { db?.close(); }
  }
  root.SpatiaLiteGeometry = { parse: parseGeometryBlob };
  root.parseSpatiaLite = parseSpatiaLite;
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SpatiaLiteGeometry;
})(globalThis);
