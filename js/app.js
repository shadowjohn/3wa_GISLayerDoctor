(() => {
  'use strict';
  const $id = id => document.getElementById(id);
  const selector = $id('data-type');
  const input = $id('upfiles');
  const zone = $id('drop-zone');
  let files = [];
  let wmts = '';
  let worker = null;
  let timeout = null;
  function setProgress(value, text) {
    $id('parse-progress').hidden = value == null;
    if (value != null) $id('parse-progress-bar').value = value;
    if (text) $id('parse-progress-text').textContent = text;
  }
  function stopParsing() {
    if (worker) worker.terminate();
    worker = null;
    clearTimeout(timeout);
    $id('parse-files').textContent = '開始解析';
    $id('cancel-parse').hidden = true;
    $id('parse-panel').setAttribute('aria-busy', 'false');
    setProgress(null);
  }
  function resetResults() {
    stopParsing();
    window.GISMap?.clear();
    $id('parse-results').replaceChildren();
    $id('parse-panel').hidden = true;
  }
  function updateParseButton() {
    const matches = FileSetClassifier.classify(files, selector.value).rows.filter(row => row.type === selector.value);
    $id('parse-files').disabled = !!worker || (selector.value === 'wmts' ? !wmts :
      selector.value === 'shapefile' ? !matches.some(row => ['zip', 'shp'].includes(row.extension)) : !matches.length);
  }
  const say = text => { $id('message').textContent = text; };
  const size = bytes => bytes < 1024 ? bytes + ' B' :
    bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';
  function render() {
    resetResults();
    updateParseButton();
    const result = FileSetClassifier.classify(files, selector.value);
    $id('file-list').replaceChildren();
    $id('groups').replaceChildren();
    const rows = result.rows.map(row => [
      row.file.name, row.extension.toUpperCase() || '未知', size(row.file.size), row.status
    ]);
    if (wmts) rows.push([wmts, 'WMTS', '—', '網址已收錄，尚未連線']);
    for (const values of rows) {
      const tr = document.createElement('tr');
      for (const value of values) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      $id('file-list').append(tr);
    }
    for (const group of result.groups) {
      const li = document.createElement('li');
      li.textContent = group.name + '：' +
        (group.missing.length ? '缺少 ' + group.missing.map(ext => '.' + ext).join('、') : '必要配套檔齊全') +
        (group.hasProjection ? '' : '；缺少 .prj，座標系統待確認') +
        (group.duplicates.length ? '；配套副檔名重複：' + group.duplicates.join('、') : '');
      $id('groups').append(li);
    }
    $id('summary').textContent = wmts ? '1 筆 WMTS 來源' : files.length ?
      files.length + ' 個檔案，共 ' + size(files.reduce((sum, file) => sum + file.size, 0)) : '尚未加入資料。';
    $id('clear-files').disabled = !rows.length;
  }
  function addFiles(incoming) {
    if (!selector.value || selector.value === 'wmts') {
      say('請先選擇檔案資料類型。');
      return;
    }
    let added = 0;
    for (const file of Array.from(incoming)) {
      if (!files.some(old => old.name === file.name && old.size === file.size && old.lastModified === file.lastModified)) {
        files.push(file);
        added++;
      }
    }
    render();
    say(added ? '已加入 ' + added + ' 個檔案；分類結果請見清單。' : '沒有新檔案可加入（重複檔案會略過）。');
  }
  selector.addEventListener('change', () => {
    files = [];
    wmts = '';
    input.value = '';
    const isWmts = selector.value === 'wmts';
    document.querySelector('.encoding-control').hidden = isWmts || selector.value === 'geotiff';
    document.querySelector('.source-crs-control').hidden = !['shapefile', 'dxf', 'geojson', 'gpx', 'geotiff'].includes(selector.value);
    $id('source-panel').hidden = !selector.value;
    $("input[reqc='upfiles']").prop('type', isWmts || !selector.value ? 'text' : 'file');
    input.multiple = !isWmts;
    input.removeAttribute('accept');
    if (!isWmts && selector.value) input.accept = FileSetClassifier.formats[selector.value].map(ext => '.' + ext).join(',');
    input.placeholder = isWmts ? 'https://example.com/wmts?SERVICE=WMTS&REQUEST=GetCapabilities' : '';
    $id('source-label').textContent = isWmts ? 'WMTS 網址' : '選擇檔案（可多選）';
    $id('source-help').textContent = isWmts ? '輸入 GetCapabilities 網址並按確定，再按開始解析。服務需允許 CORS。' : '接受：' + input.accept + '。切換資料類型會清空清單。';
    $id('confirm-url').hidden = !isWmts;
    zone.hidden = isWmts;
    say('');
    render();
  });
  input.addEventListener('input', () => {
    if (selector.value === 'wmts' && wmts) {
      wmts = ''; render(); say('網址已變更，請按確定後重新解析。');
    }
  });
  input.addEventListener('change', () => {
    if (input.type === 'file') { addFiles(input.files); input.value = ''; }
  });
  $id('source-form').addEventListener('submit', event => {
    event.preventDefault();
    if (selector.value !== 'wmts') return;
    try {
      const url = new URL(input.value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      wmts = url.href;
      render();
      say('WMTS 網址已收錄。');
    } catch {
      say('請輸入有效的 HTTP／HTTPS 網址，且不要包含帳號密碼。');
    }
  });
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });
  document.addEventListener('dragover', event => {
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      event.preventDefault();
      if (!zone.hidden && selector.value) zone.classList.add('dragging');
    }
  });
  document.addEventListener('drop', event => {
    zone.classList.remove('dragging');
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      event.preventDefault();
      addFiles(event.dataTransfer.files);
    }
  });
  document.addEventListener('dragend', () => zone.classList.remove('dragging'));
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  document.addEventListener('paste', event => {
    if (event.clipboardData?.files.length && selector.value !== 'wmts') {
      event.preventDefault();
      addFiles(event.clipboardData.files);
    }
  });
  $id('clear-files').addEventListener('click', () => {
    files = []; wmts = ''; input.value = ''; render(); say('已清空資料。');
  });
  $id('dbf-encoding').addEventListener('change', () => {
    resetResults(); updateParseButton(); say('編碼設定已變更，請按開始解析以套用。');
  });
  $id('source-crs').addEventListener('change', () => {
    resetResults(); updateParseButton(); say('資料來源座標系統已變更，請按開始解析以套用。');
  });
  $id('cancel-parse').addEventListener('click', () => {
    stopParsing(); updateParseButton(); say('已取消解析，檔案仍保留在清單。');
  });
  $id('parse-files').addEventListener('click', () => {
    if (worker || $id('parse-files').disabled) return;
    resetResults();
    const selected = FileSetClassifier.classify(files, selector.value).rows.filter(row => row.type === selector.value).map(row => row.file);
    if (selected.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) {
      say('每批最多 100 MB，請拆分後再解析。'); return;
    }
    $id('parse-panel').hidden = false;
    $id('parse-panel').setAttribute('aria-busy', 'true');
    const finish = () => { stopParsing(); updateParseButton(); };
    try {
      worker = new Worker('js/workers/parser-worker.js?v=' + encodeURIComponent($id('gis-doctor').dataset.assetVersion));
      updateParseButton();
      $id('parse-files').textContent = '解析中…';
      $id('cancel-parse').hidden = false;
      setProgress(0, '準備解析…');
      say('正在瀏覽器中解析，請稍候…');
      worker.onmessage = ({ data }) => {
        if (data.progress != null) {
          setProgress(data.progress, data.message);
          return;
        }
        finish();
        for (const [index, row] of [...$id('file-list').rows].entries()) {
          if (selector.value === 'wmts' || selected.includes(files[index])) row.cells[3].textContent = '已執行，詳見解析結果';
        }
        function text(parent, tag, value) {
          const node = document.createElement(tag);
          node.textContent = value;
          parent.append(node);
          return node;
        }
        for (const layer of data.layers) {
          const block = document.createElement('article');
          text(block, 'h3', layer.name);
          text(block, 'p', layer.summary || (layer.count + ' 筆圖徵 · ' + (layer.types.join('、') || '無幾何') + ' · ' + layer.fieldCount + ' 個屬性欄位'));
          const coordinateInfo = CoordinateInfo.describe(layer.bounds);
          if (coordinateInfo) {
            const panel = document.createElement('div'); panel.className = 'coordinate-info';
            text(panel, 'h4', layer.coordinateLabel || '解析座標');
            const dl = document.createElement('dl');
            const number = value => Number(value.toFixed(6)).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 });
            function pair(label, value) { text(dl, 'dt', label); text(dl, 'dd', value); }
            pair('Extent [minX, minY, maxX, maxY]', layer.bounds.map(number).join(', '));
            pair('X 最小／最大', [layer.bounds[0], layer.bounds[2]].map(number).join(' / '));
            pair('Y 最小／最大', [layer.bounds[1], layer.bounds[3]].map(number).join(' / '));
            pair('外框中心 X, Y', coordinateInfo.center.map(number).join(', '));
            pair('跨度 ΔX, ΔY', coordinateInfo.span.map(number).join(', ') + '（上述座標的單位）');
            for (const [i, sample] of (layer.coordinateSamples || []).entries()) pair('座標樣本 ' + (i + 1), sample.map(number).join(', '));
            if (CoordinateInfo.describe(layer.sourceBounds)) pair('SHP 檔頭原始 Extent', layer.sourceBounds.map(number).join(', '));
            panel.append(dl);
            text(panel, 'p', CoordinateInfo.describe(layer.sourceBounds || layer.bounds)?.hint || coordinateInfo.hint).className = 'note';
            if (layer.sourceCRS) {
              const details = document.createElement('details');
              text(details, 'summary', '來源 CRS 宣告（PRJ／GeoKey／GeoJSON）');
              text(details, 'pre', layer.sourceCRS);
              panel.append(details);
            }
            text(panel, 'p', '座標診斷保留解析來源數值；若手動指定來源 CRS，圖台會採用該值轉換。').className = 'note';
            block.append(panel);
          }
          for (const detail of layer.details || []) text(block, 'p', detail);
          for (const warning of layer.warnings) text(block, 'p', warning).className = 'note';
          text(block, 'p', '屬性預覽（最多 5 筆、20 欄；可左右捲動）：');
          if (!layer.fields.length) text(block, 'p', '無屬性欄位。');
          else {
            const wrap = document.createElement('div'); wrap.className = 'table-wrap';
            wrap.tabIndex = 0; wrap.setAttribute('role', 'region');
            wrap.setAttribute('aria-label', layer.name + ' 屬性預覽，可左右捲動');
            const table = document.createElement('table');
            const head = document.createElement('thead');
            const header = document.createElement('tr');
            layer.fields.forEach(field => text(header, 'th', field).scope = 'col');
            head.append(header); table.append(head);
            const body = document.createElement('tbody');
            for (const values of layer.preview) {
              const row = document.createElement('tr');
              values.forEach(value => text(row, 'td', value));
              body.append(row);
            }
            table.append(body); wrap.append(table); block.append(wrap);
          }
          $id('parse-results').append(block);
        }
        window.GISMap?.show(data.layers);
        data.errors.forEach(error => text($id('parse-results'), 'p', error).className = 'parse-error');
        say('解析完成：' + data.layers.length + ' 個圖層，' + data.errors.length + ' 個錯誤。');
      };
      worker.onerror = event => {
        event.preventDefault(); finish();
        say('解析器無法執行，請重新整理後重試。');
      };
      timeout = setTimeout(() => {
        finish(); say('解析超過 30 秒已停止，請拆分檔案再試。');
      }, 30000);
      worker.postMessage({ includeMap: true, type: selector.value, files: selected, url: wmts, encoding: $id('dbf-encoding').value, sourceCRS: $id('source-crs').value });
    } catch (error) {
      finish(); say('無法啟動解析器：' + error.message);
    }
  });
  render();
})();
