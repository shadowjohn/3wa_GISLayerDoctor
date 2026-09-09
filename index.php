<?php
  require "../../../../inc/config.php";
  // One content version keeps the page, scripts and worker imports in sync.
  $asset_files = array_merge(glob(__DIR__.'/css/*.css'), glob(__DIR__.'/js/*.js'),
    glob(__DIR__.'/js/parsers/*.js'), glob(__DIR__.'/js/workers/*.js'), glob(__DIR__.'/js/vendor/*.js'), glob(__DIR__.'/js/vendor/*.wasm'));
  $asset_version = substr(hash('sha256', implode('', array_map(function ($file) {
    return hash_file('sha256', $file);
  }, $asset_files))), 0, 16);
  $include_mode="bootstrap5|easymap7117";
  $HEAD_TITLE=__('GIS 資料健檢機｜Shapefile、SpatiaLite、XML、DXF、KML、GeoJSON 圖層檢核 - 3WA問題解決專家工作室');
  $HEAD_DESCRIPTION=__('支援 Shapefile、SpatiaLite、XML、DXF、KML、GeoJSON、GPX、GeoTIFF、WMTS 的瀏覽器端 GIS 資料解析、座標檢核、屬性預覽與圖台套疊。');
  require "{$base_dir}/html.php";
  require "{$base_dir}/head.php";
?>
<?php
  require "{$base_dir}/head_end.php";
  require "{$base_dir}/body.php";
  require "{$base_dir}/top.php";
?>
<link rel="stylesheet" href="css/gis-layer-doctor.css?v=<?=$asset_version;?>">
<main id="gis-doctor" data-asset-version="<?=$asset_version;?>">
  <header><h1>GIS 資料健檢機</h1><p>先整理資料，再認識你的圖層。</p></header>
  <p class="privacy">可選擇、拖拉或貼上各種 GIS 資料，在瀏覽器直接解析、檢核，並套疊到圖台檢視。</p>
  <div class="doctor-workspace">
  <div class="source-column">
  <section aria-labelledby="type-heading">
    <h2 id="type-heading">01 選擇資料類型</h2>
    <label for="data-type">資料類型</label>
    <select id="data-type">
      <option value="">請選擇資料類型</option>
      <option value="shapefile">Shapefile</option>
      <option value="spatialite">SpatiaLite</option>
      <option value="xml">XML（開放資料）</option>
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
    <div class="source-crs-control">
      <label for="source-crs">資料來源座標系統</label>
      <select id="source-crs" aria-describedby="source-crs-help">
        <option value="auto">自動</option>
        <option value="EPSG:4326" selected>WGS84 EPSG:4326（經緯度小數）</option>
        <option value="度分秒">度分秒 DMS（如 120°16'54.5&quot;E 23°07'03.5&quot;N）</option>
        <option value="度分">度分 DM（如 120°58.9215E 23°58.4325N）</option>
        <option value="EPSG:3825">TWD97 澎湖119（EPSG:3825）</option>
        <option value="EPSG:3826">TWD97 臺灣121（EPSG:3826）</option>
        <option value="EPSG:3827">TWD67 澎湖119（EPSG:3827）</option>
        <option value="EPSG:3828">TWD67 臺灣121（EPSG:3828）</option>
        <option value="EPSG:3857">Web Mercator（EPSG:3857 / 900913）</option>
        <option value="臺灣電力坐標" style="display:none;">臺灣電力圖號坐標（如 C6741 DC61）</option>
      </select>
      <p id="source-crs-help" class="note">自動會採用檔案宣告；手動選擇只套用到未宣告來源座標系統的資料。</p>
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
  <section class="format-guide" aria-labelledby="format-guide-heading">
    <h2 id="format-guide-heading">支援的 GIS 資料格式與檢核方式</h2>
    <p>選擇資料類型後，可直接加入檔案或 WMTS 網址。工具會在瀏覽器解析資料、整理座標與屬性資訊，並將可辨識座標系統的圖層套疊到圖台。</p>
    <div class="format-guide-grid">
      <article><h3>Shapefile（SHP）</h3><p>可加入 ZIP，或分別加入同名的 SHP、SHX、DBF、PRJ、CPG 檔案。檢查配套是否齊全、DBF 文字編碼、圖徵數量、座標範圍與屬性欄位。</p></article>
      <article><h3>SpatiaLite（SQLite）</h3><p>讀取 geometry_columns 登錄的圖層與 geometry BLOB，整理圖徵、屬性、SRID 與範圍；常用 EPSG 座標系統可直接套疊圖台。</p></article>
      <article><h3>XML（開放資料）</h3><p>優先讀取 CWA cwaopendata 站點；其他 XML 會尋找重複資料列與常見經緯度欄位。僅有 X/Y 時保留原始座標，需指定 CRS 才套圖。</p></article>
      <article><h3>DXF</h3><p>解析文字 DXF 的圖層、實體與單位資訊，支援點、線、多段線、bulge 圓弧、CIRCLE、ARC 與 BLOCK／INSERT 展開，適合檢視 CAD 圖資範圍。</p></article>
      <article><h3>KML／KMZ</h3><p>讀取 KML 地標、路線與面資料；KMZ 會解開其中的 KML。檢查經緯度範圍與屬性，座標正常時可直接套疊圖台。</p></article>
      <article><h3>GeoJSON</h3><p>支援 FeatureCollection、Feature 與各種標準幾何。檢查座標結構、幾何類型、Extent 與屬性，適合交換與 API 下載的 GIS 資料。</p></article>
      <article><h3>GPX</h3><p>解析航點、路線與軌跡，整理位置與屬性資訊，方便檢視 GPS 紀錄的空間範圍並套疊到圖台。</p></article>
      <article><h3>GeoTIFF</h3><p>讀取第一張影像的尺寸、波段、NoData、地理參考與範圍；可建立第一波段灰階預覽，協助確認遙測或網格資料的位置。</p></article>
      <article><h3>WMTS</h3><p>輸入 GetCapabilities 網址後讀取服務圖層、格式與 TileMatrixSet。解析成功會自動載入圖磚，可與其他 GIS 向量資料套疊檢視。</p></article>
    </div>
  </section>
</main>
<script src="js/file-classifier.js?v=<?=$asset_version;?>"></script>
<script src="js/map-view.js?v=<?=$asset_version;?>"></script>
<script src="js/coordinate-info.js?v=<?=$asset_version;?>"></script>
<script src="js/app.js?v=<?=$asset_version;?>"></script>
</body>
</html>
