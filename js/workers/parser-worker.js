const version = new URL(self.location.href).searchParams.get('v') || '';
const local = paths => importScripts(...paths.map(path => path + '?v=' + encodeURIComponent(version)));
local(['../layer-normalizer.js', '../file-classifier.js']);
self.onmessage = async ({ data }) => {
  try {
    self.includeMap = data.includeMap === true;
    const { type = 'shapefile', files, encoding = 'auto', url } = data;
    const progress = (value, message) => self.postMessage({ progress: value, message });
    progress(5, '載入 ' + (type === 'wmts' ? 'WMTS 服務資訊' : '解析器') + '…');
    if (type === 'shapefile') {
      importScripts('/inc/javascript/jszip/jszip3.min.js', '../vendor/shp-6.2.0.js');
      local(['../parsers/dbf-encoding.js', '../parsers/shapefile.js']);
      progress(20, '解析 Shapefile 配套檔…');
      self.postMessage(await self.parseShapefiles(files, encoding)); return;
    }
    if (!['geojson', 'kml', 'gpx', 'dxf', 'geotiff', 'wmts'].includes(type)) throw new Error('不支援的資料類型');
    local(['../vendor/gis-formats.js', '../parsers/common.js', '../parsers/geojson.js', '../parsers/' + type + '.js']);
    if (type === 'kml') importScripts('/inc/javascript/jszip/jszip3.min.js');
    if (type === 'dxf') importScripts('/inc/javascript/shapefilejs/dxfparser.min.js');
    if (type === 'wmts') { progress(35, '讀取 WMTS GetCapabilities…'); self.postMessage({ layers: await parseWMTS(url), errors: [] }); return; }
    const layers = [], errors = [];
    const parsers = { kml: self.parseKML, gpx: self.parseGPX, dxf: self.parseDXF, geotiff: self.parseGeoTIFF };
    for (const [index, file] of files.entries()) {
      try {
        progress(15 + Math.round(index / files.length * 75), '解析 ' + file.name + '（' + (index + 1) + '／' + files.length + '）…');
        const result = type === 'geojson' ?
          parseGeoJSON(JSON.parse(FormatHelpers.text(await file.arrayBuffer(), encoding)), file.name, ['保留來源座標；標準 GeoJSON 使用 WGS84 經緯度。']) :
          await parsers[type](file, encoding);
        layers.push(...(Array.isArray(result) ? result : [result]));
      } catch (error) { errors.push(file.name + '：' + error.message); }
    }
    progress(95, '整理解析結果…');
    self.postMessage({ layers, errors });
  } catch (error) { self.postMessage({ layers: [], errors: [error.message || '解析失敗'] }); }
};
