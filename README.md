# GISLayerDoctor — GIS 資料健檢機

選擇資料類型 → 多檔選取／拖拉／貼上 → 分類清單 → 開始解析 → metadata 與屬性預覽。
沿用網站 PHP 共用版型與 jQuery，使用本機 Bootstrap 5，不需 npm 建置。

- 支援分類 Shapefile（ZIP 或同名配套檔）、DXF、KML/KMZ、GeoJSON、GPX、GeoTIFF。
- 可分批追加；相同檔名、大小與修改時間視為重複。切換類型或清空會移除目前清單。
- Shapefile 依不分大小寫的同名檔分組，檢查 SHP/SHX/DBF，提示 PRJ 缺漏及配套重複。
- accept 只作選檔提示；拖拉、貼上與選檔共用分類流程，類型不符仍列出提示。
- 貼上需剪貼簿實際提供 File；純文字檔案路徑不會讀取本機檔案。資料夾請改選其中檔案。
- WMTS 確認網址後，按開始解析才由瀏覽器 GET 讀取 GetCapabilities（不帶憑證），服務需允許 CORS；不請求圖磚。
- 加入檔案先分類；按「開始解析」才在 Worker 讀取／解壓，完全不作上傳或 localStorage 儲存。
- 檔名與網址只以 textContent 顯示，不插入 HTML。副檔名分類不代表內容驗證。

## Shapefile 解析
清單下方按「開始解析」，支援 ZIP 多圖層與分開的同名配套檔。
使用專案內固定版本 [shpjs 6.2.0](https://github.com/calvinmetcalf/shapefile-js)
及站內 JSZip 3.10.1；解析器在 Worker 執行，可取消，30 秒超時終止。
每批來源上限 50 MB、解壓後配套檔上限 100 MB、每個 ZIP 最多 2000 項。
ZIP 大小預檢依 JSZip 的 _data.uncompressedSize；升級 JSZip 需重驗 ZIP 路徑。
同一圖層的錯誤會列出，其他可解析圖層仍顯示；ZIP 損壞或超限會停止整批。
顯示圖徵數、幾何類型、座標範圍、欄位數及最多 5 筆 × 20 欄屬性，每格最多 500 字。
有 PRJ 時轉為 WGS84；缺少 PRJ 時明確標示原始座標未確認。DBF 缺漏亦提示。
DBF 編碼：手動設定優先，其次 .cpg；無 .cpg 時抽樣最多 256 筆文字欄位，嚴格檢查 UTF-8，再檢查 Big5。
自動判斷屬推測：純 ASCII、雙方皆有效或混合編碼不能保證辨識，介面會提供判斷來源與手動切換。
屬性預覽採不斷行欄位、橫向捲動與固定表頭，避免大量欄位擠成直排。
加入檔案、切換類型或清空會終止舊工作並清除舊結果。

## 後續
後續可擴充完整大量資料渲染、DXF BLOCK/INSERT/bulge，以及 GeoTIFF 精密影像重投影。

## 驗證
```sh
php -l index.php
node --check js/app.js
node tests/file-classifier.test.cjs
node tests/layer-normalizer.test.cjs
node tests/dbf-encoding.test.cjs
node tests/formats.test.cjs
node tests/coordinate-info.test.cjs
```
瀏覽器檢查：各類型 accept、分批加入 SHP 配套、重複檔、拖拉／貼上、清空、
WMTS 合法／非法網址、惡意檔名純文字顯示及手機寬度。

## 共用工具評估
實際路徑為 /var/www/html/inc/javascript/include.js，由 head.php 自動載入。
dialogMyBoxOn(message, isTouchOutSideClose, functionAction) 與 dialogMyBoxOff()
可供第二階段解析進度使用；message 支援 HTML，未受信任的內容應先以 textContent 建立。
head.php 的 jquery-form flag 載入 jquery.form.js，用於 AJAX 表單送出；
本工具本機分類無此需求，因此不啟用。

## 其他格式
| 格式 | 本階段內容 |
| --- | --- |
| GeoJSON | FeatureCollection、Feature、幾何物件；座標結構檢查、筆數、範圍及屬性 |
| KML / KMZ | 使用 togeojson 轉換圖徵；KMZ 支援多個 KML，不讀取外部 NetworkLink、圖片 |
| GPX | 航點、路線、軌跡與屬性 |
| DXF | 文字 DXF 的版本、單位代碼、實體類型與數量、圖層／文字等實體預覽；二進位 DXF 不支援，尚未展開曲線或 BLOCK/INSERT |
| GeoTIFF | 第一個 IFD 的尺寸、波段、CRS、NoData、範圍及左上第一波段最多 5 個像素；超過 1600 萬像素僅顯示 metadata |
| WMTS | GetCapabilities 圖層識別碼、格式、樣式與 TileMatrixSet；保留服務提供的 capabilities URL，有 KVP service/request 參數時補正為 GetCapabilities |

每批檔案 50 MB、Worker 30 秒超時，可取消；KMZ 解壓 KML 合計上限 100 MB、最多 2000 個項目。
WMTS 回應上限 5 MB，XML 拒絕 DTD/ENTITY。其他檔案逐一解析，單檔錯誤不阻擋同批其他檔案。
文字檔自動嚴格嘗試 UTF-8，再嘗試 Big5；可手動切換。JSON 巢狀屬性以 JSON 文字預覽。
單位與 CRS 僅顯示來源資訊，不擅自假設 CAD 或 TIFF 是經緯度。

## 解析器來源
沿用站內 JSZip 3.10.1 與 DxfParser，新增固定版本 togeojson 7.1.2、xmldom 0.9.12、geotiff 3.0.5。
來源：[togeojson](https://github.com/placemark/togeojson)、[xmldom](https://github.com/xmldom/xmldom)、
[GeoTIFF.js](https://geotiffjs.github.io/geotiff.js/)、[DxfParser](https://github.com/gdsestimating/dxf-parser)。
本機 bundle、授權與可重建的 lockfile 位於 js/vendor；部署不需要 npm。
tests/fixtures/sample.tif 是合成的 2×2 TIFF（像素 1–4、EPSG:4326），不含使用者上傳資料。

## 圖台
使用站內 easymap7117 公開 addItem/removeItem 生命週期，解析後顯示向量、基本 DXF 幾何與 TIFF 灰階預覽。
WMTS 圖層預設不勾選，勾選後由 SDK 依 capabilities 載入圖磚。
支援圖層開關、縮放至資料、點選向量屬性（純文字，最多 40 欄，每格 1000 字）。
已知 CRS 使用來源宣告；無 PRJ 的 SHP、CAD、舊版未知 CRS GeoJSON 需在圖台指定來源 CRS。
提供 EPSG:4326/3857/3825/3826/3828；指定值只用於未指定 CRS 的資料，不覆蓋已知 CRS。

圖台預設開啟「流暢預覽」：每圖層均勻抽樣最多 500 筆、20000 個座標點；取消勾選後上限為 5000 筆、200000 個座標點，密集資料可能較慢。過大的單一圖徵會略過；
圖層名稱顯示預覽／完整筆數，metadata 與縮放範圍仍使用完整檔案。大量完整渲染待採用分塊／向量圖磚。
DXF 支援點、直線、不含 bulge 的多段線與 64 段近似圓弧；其餘實體會列出略過數量。
GeoTIFF 第一波段灰階縮圖最長 512 像素，NoData 透明；以轉換後外框定位，非精密影像重投影。
更換資料、重新解析與清空會移除舊圖層、清除點選內容並回收影像 Blob URL。
來源檔不上傳；底圖與 WMTS 圖磚會有正常網路請求。

座標診斷區提供解析後 Extent、各軸範圍、外框中心（非幾何重心）、跨度與三筆不同座標樣本。
Shapefile 另保留檔頭原始 Extent，PRJ／GeoKey／GeoJSON CRS 宣告可展開。
TM2／經緯度／Web Mercator 數值範圍僅作候選提示，不作 CRS 鑑定或自動套用。
