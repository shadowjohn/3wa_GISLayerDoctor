self.parseGPX = async (file, encoding) => {
  const warnings = ['GPX 航點、路線及軌跡；座標為經緯度。'];
  const doc = FormatHelpers.xml(FormatHelpers.text(await file.arrayBuffer(), encoding), 'gpx', warnings);
  return parseGeoJSON(GISFormats.gpx(doc), file.name, warnings);
};
