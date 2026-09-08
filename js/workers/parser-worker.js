const version = new URL(self.location.href).searchParams.get('v') || '';
const local = paths => importScripts(...paths.map(path => path + '?v=' + encodeURIComponent(version)));
local(['../layer-normalizer.js', '../file-classifier.js']);
self.onmessage = async ({ data }) => {
  try {
    self.includeMap = data.includeMap === true;
    const { type = 'shapefile', files, encoding = 'auto', url } = data;
    if (type === 'shapefile') {
      importScripts('/inc/javascript/jszip/jszip3.min.js', '../vendor/shp-6.2.0.js');
      local(['../parsers/dbf-encoding.js', '../parsers/shapefile.js']);
      self.postMessage(await self.parseShapefiles(files, encoding)); return;
    }
    if (!['geojson', 'kml', 'gpx', 'dxf', 'geotiff', 'wmts'].includes(type)) throw new Error('不支援的資料類型');
    local(['../vendor/gis-formats.js', '../parsers/common.js', '../parsers/geojson.js', '../parsers/' + type + '.js']);
    if (type === 'kml') importScripts('/inc/javascript/jszip/jszip3.min.js');
    if (type === 'dxf') importScripts('/inc/javascript/shapefilejs/dxfparser.min.js');
    if (type === 'wmts') { self.postMessage({ layers: await parseWMTS(url), errors: [] }); return; }
    const layers = [], errors = [];
    const parsers = { kml: self.parseKML, gpx: self.parseGPX, dxf: self.parseDXF, geotiff: self.parseGeoTIFF };
    for (const file of files) {
      try {
        const result = type === 'geojson' ?
          parseGeoJSON(JSON.parse(FormatHelpers.text(await file.arrayBuffer(), encoding)), file.name, ['保留來源座標；標準 GeoJSON 使用 WGS84 經緯度。']) :
          await parsers[type](file, encoding);
        layers.push(...(Array.isArray(result) ? result : [result]));
      } catch (error) { errors.push(file.name + '：' + error.message); }
    }
    self.postMessage({ layers, errors });
  } catch (error) { self.postMessage({ layers: [], errors: [error.message || '解析失敗'] }); }
};
