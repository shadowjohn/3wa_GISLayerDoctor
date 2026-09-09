/* Shared by the browser and the dependency-free Node check. */
(function (root) {
  'use strict';
  const formats = {
    shapefile: ['zip', 'shp', 'shx', 'dbf', 'prj', 'cpg', 'sbn', 'sbx', 'qix'],
    dxf: ['dxf'], kml: ['kml', 'kmz'], geojson: ['geojson', 'json'], xml: ['xml'],
    gpx: ['gpx'], geotiff: ['tif', 'tiff'], spatialite: ['sqlite', 'sqlite3', 'db', 'db3']
  };
  function classify(files, selected) {
    const sets = new Map();
    const rows = Array.from(files, file => {
      const name = file.webkitRelativePath || file.name;
      const dot = name.lastIndexOf('.');
      const extension = dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
      const type = Object.keys(formats).find(key => formats[key].includes(extension)) || 'unknown';
      const row = { file, extension, type, status: type === 'unknown' ? '不支援的副檔名' :
        type !== selected ? '與所選類型不符' : file.size === 0 ? '空檔案' :
        ['zip', 'kmz'].includes(extension) ? '壓縮檔，待解析內容' : '待解析' };
      if (selected === 'shapefile' && type === 'shapefile' && extension !== 'zip') {
        const key = name.slice(0, dot).toLowerCase();
        if (!sets.has(key)) sets.set(key, { name: name.slice(0, dot), extensions: new Set(), duplicates: new Set() });
        const set = sets.get(key);
        if (set.extensions.has(extension)) set.duplicates.add(extension);
        set.extensions.add(extension);
      }
      return row;
    });
    const groups = Array.from(sets.values(), set => ({
      name: set.name,
      missing: ['shp', 'shx', 'dbf'].filter(ext => !set.extensions.has(ext)),
      hasProjection: set.extensions.has('prj'),
      duplicates: Array.from(set.duplicates)
    }));
    return { rows, groups };
  }
  const api = { formats, classify };
  root.FileSetClassifier = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
