(function (root) {
  'use strict';
  function describe(bounds) {
    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
        bounds[0] > bounds[2] || bounds[1] > bounds[3]) return null;
    const [minX, minY, maxX, maxY] = bounds;
    let hint = '僅憑數值無法識別 CRS，請查原始資料說明、PRJ 或提供單位。';
    // ponytail: numeric ranges are hints only; identifying datum/zone requires source metadata.
    if (minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90) {
      hint = '數值符合 X=經度、Y=緯度的範圍；也可能是小範圍的本地座標，不能只憑數值確認 WGS84。';
    } else if (minX >= 100000 && maxX <= 400000 && minY >= 2400000 && maxY <= 2900000) {
      hint = '數值外觀接近臺灣 TM2 公尺座標，可查證 TWD97／TWD67 與 119／121 分帶；無法據此區分 EPSG:3825／3826／3827／3828。';
    } else if (Math.max(Math.abs(minX), Math.abs(maxX)) > 10000000 &&
               Math.max(...bounds.map(Math.abs)) <= 20037509) {
      hint = '數值量級可能是 Web Mercator（EPSG:3857）或其他投影座標，仍需來源資料確認。';
    }
    return { center: [(minX + maxX) / 2, (minY + maxY) / 2], span: [maxX - minX, maxY - minY], hint };
  }
  root.CoordinateInfo = { describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CoordinateInfo;
})(globalThis);
