(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  let map = null, results = [], items = [];
  const status = message => { byId('map-status').textContent = message; };
  function clear() {
    for (const entry of items) { if (entry.item && entry.added) map.removeItem(entry.item); if (entry.url) URL.revokeObjectURL(entry.url); }
    items = []; results = [];
    byId('map-layers').replaceChildren(); byId('map-properties').replaceChildren();
    byId('map-feature').hidden = true; byId('map-fit').disabled = true;
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
  function show(layers) {
    clear(); results = layers;
    if (!map) { status('圖台未載入，請重新整理重試。'); return; }
    const messages = [];
    for (const layer of layers) {
      const data = layer.mapData;
      if (!data) { messages.push(layer.name + '：目前沒有可顯示的幾何。'); continue; }
      try {
        let item, featureProperties = null, extent = null, blobUrl = null, labelText = layer.name, checked = true;
        const crs = data.crs || byId('map-crs').value;
        if (data.kind === 'wmts') {
          item = new dgSource('WMTS', { name: 'doctor-wmts-' + items.length, url: data.url, capabilitiesUrl: data.url, layer: data.layer, bg: false });
          checked = false;
          labelText += ' · 勾選以載入圖磚';
        } else {
          if (!crs) { messages.push(layer.name + '：請指定來源座標系統。'); continue; }
          if (!ol.proj.get(crs)) throw new Error('圖台不支援 ' + crs);
          if (data.kind === 'image') {
            extent = ol.proj.transformExtent(data.bounds, crs, 'EPSG:4326');
            blobUrl = URL.createObjectURL(data.blob);
            item = new dgStaticImage(blobUrl, new dgXY(extent[0], extent[3]), new dgXY(extent[2], extent[1]));
            labelText += ' · 第一波段灰階預覽';
          } else {
            const collection = byId('map-smooth').checked
              ? { type: 'FeatureCollection', features: LayerNormalizer.sampleMapFeatures(data.collection.features, 500, 20000) }
              : data.collection;
            const features = new ol.format.GeoJSON().readFeatures(collection, { dataProjection: crs, featureProjection: 'EPSG:4326' });
            featureProperties = collection.features.map(feature => feature.properties);
            const wkt = new ol.format.WKT();
            const records = features.map((feature, index) => ({ label: '', wkt: wkt.writeFeature(feature) }));
            if (!records.length) { messages.push(layer.name + '：無可預覽圖徵。'); continue; }
            extent = ol.proj.transformExtent(layer.bounds, crs, 'EPSG:4326');
            item = new dgWKT(records, 'EPSG:4326');
            labelText += ' · ' + features.length.toLocaleString() + ' / ' + data.total.toLocaleString() + ' 筆';
            if (features.length < data.total) messages.push(layer.name + '：目前為抽樣預覽；取消「流暢預覽」可顯示更多圖徵。完整資訊請見解析結果。');
          }
          if (!extent.every(Number.isFinite) || extent[0] < -180 || extent[2] > 180 || extent[1] < -90 || extent[3] > 90) {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            throw new Error('轉換後不在經緯度範圍，請檢查座標系統');
          }
        }
        const entry = { item, extent, checked, url: blobUrl, added: checked };
        if (data.kind === 'vector') item.setFeatureClick(record => {
          if (entry.checked) properties(featureProperties[record.data_index]);
        });
        if (checked) map.addItem(item);
        items.push(entry);
        const label = document.createElement('label'), checkbox = document.createElement('input'), text = document.createElement('span');
        checkbox.type = 'checkbox'; checkbox.checked = checked;
        text.textContent = labelText;
        checkbox.addEventListener('change', () => {
          entry.checked = checkbox.checked;
          if (!entry.added && checkbox.checked) { map.addItem(item); entry.added = true; }
          if (typeof item.setOpacity === 'function') item.setOpacity(checkbox.checked ? 1 : 0);
          else {
            if (!checkbox.checked && entry.added) { map.removeItem(item); entry.added = false; }
          }
        });
        label.append(checkbox, text); byId('map-layers').append(label);
      } catch (error) { messages.push(layer.name + '：' + error.message); }
    }
    byId('map-fit').disabled = !items.some(entry => entry.extent);
    fit();
    status(messages.join(' ') || (items.length ? '已準備 ' + items.length + ' 個圖層；可切換顯示，向量圖徵可點選查看屬性。' : '沒有可顯示的圖層。'));
  }
  window.GISMap = { clear, show };
  byId('map-crs').addEventListener('change', () => show(results));
  byId('map-fit').addEventListener('click', fit);
  byId('map-smooth').addEventListener('change', () => show(results));
  try {
    map = window['map'] = new Easymap('map-view');
    map.zoomToXY(new dgXY(120.9, 23.7), 7);
    new ResizeObserver(() => map.resize()).observe(byId('map-view'));
    status('加入資料並解析後，圖層會顯示在這裡。');
  } catch (error) { status('圖台載入失敗：' + error.message); }
})();
