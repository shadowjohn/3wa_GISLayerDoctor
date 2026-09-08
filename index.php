<?php
  require "../../../../inc/config.php";
  // One content version keeps the page, scripts and worker imports in sync.
  $asset_files = array_merge(glob(__DIR__.'/css/*.css'), glob(__DIR__.'/js/*.js'),
    glob(__DIR__.'/js/parsers/*.js'), glob(__DIR__.'/js/workers/*.js'), glob(__DIR__.'/js/vendor/*.js'));
  $asset_version = substr(hash('sha256', implode('', array_map(function ($file) {
    return hash_file('sha256', $file);
  }, $asset_files))), 0, 16);
  $include_mode="bootstrap5|easymap7117";
  require "{$base_dir}/html.php";
  require "{$base_dir}/head.php";
?>
<title>GIS <?=__('資料健檢機');?> - <?=__('歡迎來到3WA問題解決專家工作室');?></title>
<?php
  require "{$base_dir}/head_end.php";
  require "{$base_dir}/body.php";
  require "{$base_dir}/top.php";
?>
<link rel="stylesheet" href="css/gis-layer-doctor.css?v=<?=$asset_version;?>">
<main id="gis-doctor" data-asset-version="<?=$asset_version;?>">
  <header><h1>GIS 資料健檢機</h1><p>先整理資料，再認識你的圖層。</p></header>
  <p class="privacy">檔案只在您的瀏覽器處理，不會上傳至伺服器。</p>
  <div class="doctor-workspace">
  <div class="source-column">
  <section aria-labelledby="type-heading">
    <h2 id="type-heading">01 選擇資料類型</h2>
    <label for="data-type">資料類型</label>
    <select id="data-type">
      <option value="">請選擇資料類型</option>
      <option value="shapefile">Shapefile</option>
      <option value="dxf">DXF</option>
      <option value="kml">KML</option>
      <option value="geojson">GeoJSON</option>
      <option value="gpx">GPX</option>
      <option value="geotiff">GeoTIFF</option>
      <option value="wmts">WMTS</option>
    </select>
  </section>
  <section id="source-panel" hidden aria-labelledby="source-heading">
    <h2 id="source-heading">02 加入資料</h2>
    <form id="source-form">
      <label id="source-label" for="upfiles">選擇檔案（可多選）</label>
      <input id="upfiles" type="text" multiple reqc="upfiles" aria-describedby="source-help" autocomplete="off">
      <p id="source-help"></p>
      <button id="confirm-url" type="submit" hidden>確定</button>
    </form>
    <div id="drop-zone" tabindex="0" role="button" aria-label="拖拉或貼上檔案，也可按 Enter 選檔">
      <strong>將檔案拖曳到這裡</strong>
      <span>也可點擊選檔，或在此貼上剪貼簿中的檔案</span>
      <small>Shapefile 可分次加入同名的配套檔案</small>
    </div>
  </section>
  <p id="message" role="status" aria-live="polite"></p>
  <section aria-labelledby="list-heading">
    <div class="list-heading"><h2 id="list-heading">03 資料清單</h2><button id="clear-files" type="button" disabled>清空</button></div>
    <p id="summary">尚未加入資料。</p>
    <ul id="groups"></ul>
    <div class="table-wrap"><table>
      <caption class="visually-hidden">已加入的檔案資訊</caption>
      <thead><tr><th scope="col">檔名／網址</th><th scope="col">類型</th><th scope="col">大小</th><th scope="col">狀態</th></tr></thead>
      <tbody id="file-list"></tbody>
    </table></div>
    <div class="encoding-control">
      <label for="dbf-encoding">文字編碼（含 DBF）</label>
      <select id="dbf-encoding" aria-describedby="encoding-help">
        <option value="auto">自動（UTF-8／Big5，DBF 優先 .cpg）</option>
        <option value="utf-8">UTF-8</option>
        <option value="big5">Big5／CP950</option>
      </select>
      <p id="encoding-help" class="note">若中文亂碼，可切換編碼再按開始解析。</p>
    </div>
    <div class="parse-actions">
      <button id="parse-files" type="button" disabled aria-describedby="parse-help">開始解析</button>
      <button id="cancel-parse" type="button" hidden>取消解析</button>
    </div>
    <div id="parse-progress" hidden aria-live="polite">
      <progress id="parse-progress-bar" max="100" value="0">0%</progress>
      <span id="parse-progress-text">準備解析…</span>
    </div>
    <p id="parse-help" class="note">加入所選類型的資料後按「開始解析」。WMTS 將連線讀取服務資訊；檔案仍只在本機處理。</p>
  </section>
  </div>
  <div class="results-column">
    <section id="map-panel" aria-labelledby="map-heading">
      <h2 id="map-heading">圖台</h2>
      <div id="map-view" aria-label="GIS 圖層預覽地圖"></div>
      <p id="map-status" role="status">正在載入圖台…</p>
      <div id="map-layers" aria-label="圖層開關"></div>
      <div id="map-feature" hidden><h3>點選圖徵屬性</h3><dl id="map-properties"></dl></div>
    </section>
    <section id="analysis-panel" aria-labelledby="analysis-heading">
      <h2 id="analysis-heading">解析說明</h2>
      <p class="note">在左側加入檔案並按「開始解析」，這裡會顯示圖層筆數、幾何類型、座標範圍、缺件提示與屬性預覽。</p>
      <div id="parse-panel" hidden aria-labelledby="parse-heading">
    <h3 id="parse-heading">解析結果與資料預覽</h3>
    <div id="parse-results"></div>
      </div>
    </section>
  </div>
  </div>
</main>
<script src="js/file-classifier.js?v=<?=$asset_version;?>"></script>
<script src="js/map-view.js?v=<?=$asset_version;?>"></script>
<script src="js/coordinate-info.js?v=<?=$asset_version;?>"></script>
<script src="js/app.js?v=<?=$asset_version;?>"></script>
</body>
</html>
