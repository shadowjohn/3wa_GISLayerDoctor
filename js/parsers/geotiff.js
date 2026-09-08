self.parseGeoTIFF = async file => {
  const tiff = await GISFormats.fromArrayBuffer(await file.arrayBuffer());
  const image = await tiff.getImage();
  const width = image.getWidth(), height = image.getHeight();
  const keys = image.getGeoKeys() || {};
  let bounds = null;
  try { bounds = image.getBoundingBox(); } catch {}
  const rows = [];
  const warnings = ['目前顯示第一張影像的 metadata 與左上角第一波段像素樣本。'];
  if (width * height <= 16000000) {
    const raster = await image.readRasters({ window: [0, 0, Math.min(width, 5), Math.min(height, 1)], samples: [0] });
    for (let x = 0; x < raster[0].length; x++) rows.push({ x, y: 0, band: 1, value: raster[0][x] });
  } else warnings.push('影像超過 1600 萬像素，略過像素解碼以控制記憶體。');
  const result = FormatHelpers.table(file.name, '筆像素樣本', rows, warnings,
    ['影像尺寸：' + width + ' × ' + height, '波段：' + image.getSamplesPerPixel(),
     'NoData：' + (image.getGDALNoData() ?? '未提供'),
     'CRS：' + (keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey || '未提供')]);
  result.bounds = bounds;
  result.coordinateLabel = '影像來源座標';
  const sourceEPSG = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey;
  result.sourceCRS = sourceEPSG ? 'EPSG:' + sourceEPSG : '';
  if (!bounds) warnings.push('缺少地理定位資訊，無法計算座標範圍。');
  if (self.includeMap && bounds && width * height <= 16000000) {
    const scale = Math.min(1, 512 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const raster = (await image.readRasters({ width: w, height: h, samples: [0] }))[0];
    const nodata = image.getGDALNoData();
    let min = Infinity, max = -Infinity;
    for (const value of raster) if (Number.isFinite(value) && value !== nodata) { min = Math.min(min, value); max = Math.max(max, value); }
    const canvas = new OffscreenCanvas(w, h), context = canvas.getContext('2d');
    const pixels = context.createImageData(w, h);
    for (let i = 0; i < raster.length; i++) {
      const value = raster[i], valid = Number.isFinite(value) && value !== nodata;
      const gray = max > min ? Math.round(255 * (value - min) / (max - min)) : 160;
      pixels.data.set([gray, gray, gray, valid ? 210 : 0], i * 4);
    }
    context.putImageData(pixels, 0, 0);
    const epsg = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey;
    result.mapData = { kind: 'image', blob: await canvas.convertToBlob(), bounds, crs: epsg && epsg !== 32767 ? 'EPSG:' + epsg : null };
    warnings.push('圖台使用第一波段灰階縮圖（最長 512 像素），依外框定位，非精密影像重投影。');
  }
  return result;
};
