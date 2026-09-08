(function (root) {
  'use strict';
  // ponytail: bounded preview; use tiled rendering when all large geometries must stay interactive.
  function sampleMapFeatures(features, maxFeatures = 5000, maxVertices = 200000) {
    const mapFeatures = [];
    let vertices = 0;
    const step = Math.max(1, Math.ceil(features.length / maxFeatures));
    const countVertices = value => !Array.isArray(value) ? 0 : typeof value[0] === 'number' ? 1 : value.reduce((sum, item) => sum + countVertices(item), 0);
    const geometryVertices = g => !g ? 0 : g.type === 'GeometryCollection' ? g.geometries.reduce((sum, item) => sum + geometryVertices(item), 0) : countVertices(g.coordinates);
    for (let i = 0; i < features.length; i += step) {
      const feature = features[i];
      const count = geometryVertices(feature.geometry);
      if (!count || vertices + count > maxVertices) continue;
      vertices += count;
      mapFeatures.push(feature);
    }
    return mapFeatures;
  }
  function summarize(collection, name, warnings) {
    if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new Error('解析結果不是有效的 FeatureCollection');
    }
    const types = new Set();
    const fields = new Set();
    let bounds = null;
    const coordinateSamples = [];
    function coordinates(value) {
      if (!Array.isArray(value)) return;
      if (typeof value[0] === 'number') {
        const [x, y] = value;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (coordinateSamples.length < 3 && !coordinateSamples.some(pair => pair[0] === x && pair[1] === y)) coordinateSamples.push([x, y]);
        if (!bounds) bounds = [x, y, x, y];
        else {
          bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
          bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
        }
      } else value.forEach(coordinates);
    }
    function geometry(value) {
      if (!value) { types.add('Null'); return; }
      types.add(value.type);
      if (value.type === 'GeometryCollection') value.geometries.forEach(geometry);
      else coordinates(value.coordinates);
    }
    for (const feature of collection.features) {
      geometry(feature.geometry);
      Object.keys(feature.properties || {}).forEach(field => fields.add(field));
    }
    // ponytail: preview only 5 rows × 20 fields; add paging when full attribute browsing is needed.
    const previewFields = [...fields].slice(0, 20);
    const mapFeatures = root.includeMap ? sampleMapFeatures(collection.features) : [];
    return {
      mapData: root.includeMap ? { kind: 'vector', crs: null, collection: { type: 'FeatureCollection', features: mapFeatures }, total: collection.features.length } : null,
      name, count: collection.features.length, types: [...types], bounds, coordinateSamples,
      fieldCount: fields.size, fields: previewFields, warnings,
      preview: collection.features.slice(0, 5).map(feature =>
        previewFields.map(field => (typeof feature.properties?.[field] === 'object' && feature.properties[field] !== null ? JSON.stringify(feature.properties[field]) : String(feature.properties?.[field] ?? '')).slice(0, 500)))
    };
  }
  root.LayerNormalizer = { summarize, sampleMapFeatures };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LayerNormalizer;
})(globalThis);
