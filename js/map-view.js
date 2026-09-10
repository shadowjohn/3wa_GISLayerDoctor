(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const MAX_FEATURES_PER_BATCH = 250;
  const MAX_VERTICES_PER_BATCH = 25000;
  let map = null, items = [];
  const status = message => { byId('map-status').textContent = message; };
  const defer = callback => ('requestIdleCallback' in window ? requestIdleCallback(callback, { timeout: 100 }) : requestAnimationFrame(callback));
  function geometryVertices(geometry) {
    if (!geometry) return 0;
    if (geometry.type === 'GeometryCollection') return geometry.geometries.reduce((total, item) => total + geometryVertices(item), 0);
    const count = coordinates => !Array.isArray(coordinates) ? 0 : typeof coordinates[0] === 'number' ? 1 : coordinates.reduce((total, item) => total + count(item), 0);
    return count(geometry.coordinates);
  }
  function batches(features) {
    const result = []; let batch = [], vertices = 0;
    for (const feature of features) {
      const count = geometryVertices(feature.geometry);
      if (batch.length && (batch.length >= MAX_FEATURES_PER_BATCH || vertices + count > MAX_VERTICES_PER_BATCH)) {
        result.push(batch); batch = []; vertices = 0;
      }
      batch.push(feature); vertices += count;
    }
    if (batch.length) result.push(batch);
    return result;
  }
  function mount(entry, item) {
    if (entry.mounted.has(item)) return;
    map.addItem(item); entry.mounted.add(item);
  }
  function unmount(entry, item) {
    if (!entry.mounted.has(item)) return;
    map.removeItem(item); entry.mounted.delete(item);
  }
  function clear() {
    for (const entry of items) {
      entry.cancelled = true;
      for (const item of entry.mounted) map.removeItem(item);
      if (entry.url) URL.revokeObjectURL(entry.url);
    }
    items = [];
    byId('map-layers').replaceChildren(); byId('map-properties').replaceChildren();
    byId('map-feature').hidden = true;
    if (map) status('加入資料並解析後，圖層會顯示在這裡。');
  }
  function properties(record) {
    byId('map-properties').replaceChildren();
    for (const [key, value] of Object.entries(record || {}).slice(0, 40)) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = key;
      dd.textContent = (typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')).slice(0, 1000);
      byId('map-properties').append(dt, dd);
    }
    byId('map-feature').hidden = false;
  }
  function fit() {
    const visible = items.filter(entry => entry.checked && entry.extent);
    if (!visible.length) return;
    const extent = visible.reduce((out, entry) => [
      Math.min(out[0], entry.extent[0]), Math.min(out[1], entry.extent[1]),
      Math.max(out[2], entry.extent[2]), Math.max(out[3], entry.extent[3])
    ], [Infinity, Infinity, -Infinity, -Infinity]);
    const boundary = new ol.format.WKT().readFeatures(
      'MULTIPOINT((' + extent[0] + ' ' + extent[1] + '),(' + extent[2] + ' ' + extent[3] + '))',
      { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
    );
    map._zoomByBoundary(boundary, { padding: [40, 40, 40, 40], maxZoom: 18 });
  }
  function setVisibility(entry, checked) {
    entry.checked = checked;
    for (const item of entry.items) {
      if (checked) {
        if (entry.mounted.has(item) && typeof item.setOpacity === 'function') item.setOpacity(1);
        else mount(entry, item);
      } else if (typeof item.setOpacity === 'function') item.setOpacity(0);
      else unmount(entry, item);
    }
    if (checked) entry.start?.();
  }
  function addLayerControl(entry, labelText) {
    const label = document.createElement('label'), checkbox = document.createElement('input'), text = document.createElement('span');
    checkbox.type = 'checkbox'; checkbox.checked = entry.checked; text.textContent = labelText;
    checkbox.addEventListener('change', () => setVisibility(entry, checkbox.checked));
    label.append(checkbox, text); byId('map-layers').append(label);
    return text;
  }
  function addVectorLayer(layer, data, crs, extent) {
    const sourceBatches = batches(data.collection.features);
    const entry = { items: [], mounted: new Set(), extent, checked: true, rendered: 0, nextBatch: 0, cancelled: false };
    const text = addLayerControl(entry, layer.name + ' · 0 / ' + data.total.toLocaleString() + ' 筆（繪製中）');
    const updateText = () => {
      text.textContent = layer.name + ' · ' + entry.rendered.toLocaleString() + ' / ' + data.total.toLocaleString() +
        (entry.nextBatch < sourceBatches.length ? ' 筆（繪製中）' : ' 筆');
    };
    entry.start = () => {
      if (entry.scheduled || entry.cancelled || !entry.checked || entry.nextBatch >= sourceBatches.length) return;
      entry.scheduled = true;
      defer(() => {
        entry.scheduled = false;
        if (entry.cancelled || !entry.checked) return;
        const source = sourceBatches[entry.nextBatch++];
        try {
          const features = new ol.format.GeoJSON().readFeatures({ type: 'FeatureCollection', features: source }, { dataProjection: crs, featureProjection: 'EPSG:4326' });
          const writer = new ol.format.WKT();
          const records = features.map(feature => ({ label: '', wkt: writer.writeFeature(feature) }));
          if (records.length) {
            const item = new dgWKT(records, 'EPSG:4326');
            const geometryCollection = item.getStyle().GeometryCollection;
            geometryCollection.getStroke().setColor('#0f5f73');
            geometryCollection.getFill().setColor('rgba(14, 116, 144, 0.24)');
            geometryCollection.getImage().getStroke().setColor('#0f5f73');
            geometryCollection.getImage().getFill().setColor('rgba(14, 116, 144, 0.65)');
            item.setFeatureClick(record => { if (entry.checked) properties(source[record.data_index]?.properties); });
            entry.items.push(item); mount(entry, item); entry.rendered += records.length;
          }
        } catch (error) {
          text.textContent = layer.name + ' · 繪製失敗：' + error.message;
          entry.cancelled = true;
          return;
        }
        updateText(); entry.start();
      });
    };
    items.push(entry); entry.start();
  }
  function show(layers) {
    clear();
    if (!map) { status('圖台未載入，請重新整理重試。'); return; }
    const messages = [];
    for (const layer of layers) {
      const data = layer.mapData;
      if (!data) { messages.push(layer.name + '：目前沒有可顯示的幾何。'); continue; }
      try {
        if (data.kind === 'wmts' || data.kind === 'xyz') {
          const item = data.kind === 'wmts' ?
            new dgSource('WMTS', { name: 'doctor-wmts-' + items.length, url: data.url, capabilitiesUrl: data.url, layer: data.layer, bg: false }) :
            new dgSource('webtiles', { name: 'doctor-xyz-' + items.length, url: data.url, bg: false });
          const entry = { items: [item], mounted: new Set(), checked: true, extent: null, cancelled: false };
          mount(entry, item); items.push(entry); addLayerControl(entry, layer.name + ' · 已載入圖磚'); continue;
        }
        const crs = data.crs;
        if (!crs) { messages.push(layer.name + '：來源座標系統不明，暫不套圖；座標資訊請見解析說明。'); continue; }
        if (!ol.proj.get(crs)) throw new Error('圖台不支援 ' + crs);
        if (data.kind === 'image') {
          const extent = ol.proj.transformExtent(data.bounds, crs, 'EPSG:4326');
          if (!extent.every(Number.isFinite)) throw new Error('轉換後座標無效');
          const url = URL.createObjectURL(data.blob);
          const item = new dgStaticImage(url, new dgXY(extent[0], extent[3]), new dgXY(extent[2], extent[1]));
          const entry = { items: [item], mounted: new Set(), checked: true, extent, url, cancelled: false };
          mount(entry, item); items.push(entry); addLayerControl(entry, layer.name + ' · 第一波段灰階預覽'); continue;
        }
        const extent = ol.proj.transformExtent(layer.bounds, crs, 'EPSG:4326');
        if (!extent.every(Number.isFinite) || extent[0] < -180 || extent[2] > 180 || extent[1] < -90 || extent[3] > 90) throw new Error('轉換後不在經緯度範圍，請檢查座標系統');
        if (!data.collection.features.length) { messages.push(layer.name + '：無可預覽圖徵。'); continue; }
        addVectorLayer(layer, data, crs, extent);
      } catch (error) { messages.push(layer.name + '：' + error.message); }
    }
    fit();
    const vectorCount = items.filter(entry => entry.start).length;
    status(messages.join(' ') || (vectorCount ? '正在逐批繪製 ' + vectorCount + ' 個圖層；向量圖徵可點選查看屬性。' : items.length ? '已準備 ' + items.length + ' 個圖層。' : '沒有可顯示的圖層。'));
  }
  window.GISMap = { clear, show };
  try {
    map = window['map'] = new Easymap('map-view');
    map.zoomToXY(new dgXY(120.9, 23.7), 7);
    new ResizeObserver(() => map.resize()).observe(byId('map-view'));
    status('加入資料並解析後，圖層會顯示在這裡。');
  } catch (error) { status('圖台載入失敗：' + error.message); }
})();
