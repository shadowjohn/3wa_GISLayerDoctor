/* Runs in the parser worker; no uploaded file is used as a URL. */
self.parseShapefiles = async (files, encoding = 'auto') => {
  const limit = 100 * 1024 * 1024;
  const sets = new Map();
  let total = 0;
  async function add(name, data, size) {
    const match = /^(.*)\.(shp|shx|dbf|prj|cpg)$/i.exec(name);
    if (!match || name.split('/').includes('__MACOSX')) return;
    total += size;
    if (!Number.isFinite(size) || size < 0 || total > limit) throw new Error('解壓後的資料超過 100 MB，請拆分資料。');
    const key = match[1].toLowerCase();
    if (!sets.has(key)) sets.set(key, { name: match[1], parts: Object.create(null) });
    const set = sets.get(key);
    const ext = match[2].toLowerCase();
    if (set.parts[ext]) throw new Error('同名配套檔重複：' + name);
    set.parts[ext] = await data();
  }
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const entries = Object.values(zip.files);
      if (entries.length > 2000) throw new Error('ZIP 項目超過 2000，請拆分資料。');
      for (const entry of entries) {
        if (entry.dir) continue;
        // JSZip 3 stores the declared uncompressed size before allocating output.
        await add(file.name + '/' + entry.name, () => entry.async('arraybuffer'), entry._data.uncompressedSize);
      }
    } else {
      await add(file.webkitRelativePath || file.name, () => file.arrayBuffer(), file.size);
    }
  }
  if (!sets.size) throw new Error('找不到 Shapefile，ZIP 內需含 .shp 檔案。');
  const layers = [];
  const errors = [];
  for (const set of sets.values()) {
    try {
      if (!set.parts.shp) throw new Error('缺少 .shp 主檔');
      const warnings = [];
      if (!set.parts.dbf) warnings.push('缺少 .dbf，無屬性資料。');
      if (!set.parts.shx) warnings.push('缺少 .shx；本解析器可直接讀取 SHP。');
      warnings.push(set.parts.prj ? '已依 .prj 轉為 WGS84 經緯度。' : '缺少 .prj：保留原始座標，不能確認為經緯度。');
      if (set.parts.dbf) {
        const detected = DbfEncoding.choose(set.parts.dbf, set.parts.cpg, encoding);
        set.parts.cpg = detected.encoding;
        warnings.push('DBF 編碼：' + detected.encoding.toUpperCase() + '（' + detected.source + '）。');
      }
      const collection = await shp(set.parts);
      const result = LayerNormalizer.summarize(collection, set.name, warnings);
      const header = new DataView(set.parts.shp);
      result.sourceBounds = [36, 44, 52, 60].map(offset => header.getFloat64(offset, true));
      result.sourceCRS = set.parts.prj ? new TextDecoder().decode(set.parts.prj) : '';
      result.coordinateLabel = set.parts.prj ? '解析後座標（WGS84 / EPSG:4326）' : '原始座標（未宣告 CRS）';
      if (result.mapData) result.mapData.crs = set.parts.prj ? 'EPSG:4326' : null;
      layers.push(result);
    } catch (error) {
      errors.push(set.name + '：' + error.message);
    }
  }
  return { layers, errors };
};
