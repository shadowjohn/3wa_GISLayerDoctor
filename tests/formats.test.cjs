const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { TextDecoder, TextEncoder } = require('node:util');
const root = path.resolve(__dirname, '..');
global.self = globalThis;
for (const file of ['vendor/gis-formats.js', 'layer-normalizer.js', 'parsers/common.js', 'parsers/geojson.js',
  'parsers/kml.js', 'parsers/gpx.js', 'parsers/dxf.js', 'parsers/geotiff.js', 'parsers/wmts.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), {filename:file});
}
vm.runInThisContext(fs.readFileSync('/var/www/html/inc/javascript/jszip/jszip3.min.js','utf8'));
vm.runInThisContext(fs.readFileSync('/var/www/html/inc/javascript/shapefilejs/dxfparser.min.js','utf8'));
const file = (name, data) => Object.assign(new Blob([data]), { name });
const kml = '<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>中文</name><Point><coordinates>121,25</coordinates></Point></Placemark></kml>';
const gpx = '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="25" lon="121"><name>中文</name></wpt></gpx>';
const dxf = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n道路\n10\n120\n20\n24\n11\n121\n21\n25\n0\nENDSEC\n0\nEOF\n'.replaceAll('\\n','\n');
(async () => {
 const result = parseGeoJSON({type:'Feature',geometry:{type:'Point',coordinates:[121,25]},properties:{name:'<img onerror=1>'}},'point',[]);
 assert.deepEqual(result.bounds,[121,25,121,25]);
 assert.throws(()=>parseGeoJSON({type:'Point',coordinates:['bad',25]},'bad'));
 assert.throws(()=>FormatHelpers.xml('<!DOCTYPE kml><kml/>','kml'));
 assert.throws(()=>FormatHelpers.xml('<kml><Placemark></kml>','kml'));
 assert.equal((await parseKML(file('test.kml',kml),'auto'))[0].count,1);
 const damaged = (await parseKML(file('damaged.kml',kml.replace('中文','圖層�')),'auto'))[0];
 assert.equal(damaged.count,1);
 assert.ok(damaged.warnings.some(message=>message.includes('替代字元')));
 assert.ok(damaged.preview[0].includes('圖層�'));
 const invalidCoordinates = (await parseKML(file('projected.kml',kml.replace('121,25','-129,2737200')),'auto'))[0];
 assert.match(invalidCoordinates.coordinateLabel,/超出合法/);
 assert.match(invalidCoordinates.warnings[0],/匯出錯誤/);
 const damagedGPX = await parseGPX(file('damaged.gpx',gpx.replace('中文','航點�')),'auto');
 assert.equal(damagedGPX.count,1);
 assert.ok(damagedGPX.warnings.some(message=>message.includes('替代字元')));
 const zip = new JSZip(); zip.file('doc.kml', kml);
 assert.equal((await parseKML(file('test.kmz',await zip.generateAsync({type:'uint8array'})),'auto'))[0].count,1);
 assert.equal((await parseGPX(file('test.gpx',gpx),'auto')).count,1);
 assert.equal((await parseDXF(file('test.dxf',dxf),'auto')).count,1);
 const raster = await parseGeoTIFF(file('sample.tif', fs.readFileSync(path.join(__dirname,'fixtures/sample.tif'))));
 assert.deepEqual(raster.bounds,[120,23,122,25]);
 assert.equal(raster.preview[0][3],'1');
 const caps='<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1" version="1.0.0"><Contents><Layer><ows:Identifier>test</ows:Identifier><ows:Title>測試圖層</ows:Title><Format>image/png</Format><TileMatrixSetLink><TileMatrixSet>grid</TileMatrixSet></TileMatrixSetLink></Layer><TileMatrixSet><ows:Identifier>grid</ows:Identifier></TileMatrixSet></Contents></Capabilities>';
 global.fetch = async () => new Response(caps);
 assert.equal((await parseWMTS('https://example.test/wmts?service=WMTS'))[0].name,'測試圖層');
 global.fetch = async () => { throw new Error('network'); };
 await assert.rejects(()=>parseWMTS('https://example.test/wmts'),/CORS/);
 console.log('GeoJSON, KML/KMZ, GPX, DXF, GeoTIFF, XML rejection and WMTS checks passed');
})().catch(error=>{console.error(error);process.exit(1)});
