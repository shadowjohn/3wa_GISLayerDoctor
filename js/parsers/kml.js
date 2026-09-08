self.parseKML = async (file, encoding) => {
  const sources = [];
  if (/\.kmz$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files);
    if (entries.length > 2000) throw new Error('KMZ 項目超過 2000');
    let size = 0;
    for (const entry of entries) {
      if (entry.dir || !/\.kml$/i.test(entry.name)) continue;
      size += entry._data.uncompressedSize;
      if (!Number.isFinite(size) || size > 100 * 1024 * 1024) throw new Error('KMZ 解壓後超過 100 MB');
      sources.push([file.name + '/' + entry.name, await entry.async('arraybuffer')]);
    }
    if (!sources.length) throw new Error('KMZ 內找不到 KML');
  } else sources.push([file.name, await file.arrayBuffer()]);
  return sources.map(([name, buffer]) => {
    const warnings = ['KML 座標為經緯度；樣式、圖片與 NetworkLink 僅讀取資料，不載入外部資源。'];
    const doc = FormatHelpers.xml(FormatHelpers.text(buffer, encoding), 'kml', warnings);
    const result = parseGeoJSON(GISFormats.kml(doc), name, warnings);
    const bounds = result.bounds;
    if (bounds && (bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -90 || bounds[3] > 90)) {
      result.coordinateLabel = 'KML 原始座標（超出合法經緯度範圍）';
      result.warnings[0] = 'KML 原始座標超出經緯度範圍，可能是投影座標或匯出錯誤；請確認來源 CRS，必要時重新匯出，不可直接當作 WGS84。';
      if (result.mapData) result.mapData.crs = null;
    }
    return result;
  });
};
