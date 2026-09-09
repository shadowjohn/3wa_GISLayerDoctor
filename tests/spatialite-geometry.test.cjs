const assert = require('node:assert/strict');
const { parse } = require('../js/parsers/spatialite.js');

function blob(type, payload, srid = 4326) {
  const bytes = new Uint8Array(44 + payload.length), view = new DataView(bytes.buffer);
  bytes[0] = 0; bytes[1] = 1; view.setInt32(2, srid, true); bytes[38] = 0x7c;
  view.setUint32(39, type, true); bytes.set(payload, 43); bytes[bytes.length - 1] = 0xfe;
  return bytes;
}
function point(x, y, z) {
  const bytes = new Uint8Array(z == null ? 16 : 24), view = new DataView(bytes.buffer);
  view.setFloat64(0, x, true); view.setFloat64(8, y, true);
  if (z != null) view.setFloat64(16, z, true);
  return bytes;
}

assert.deepEqual(parse(blob(1, point(121, 25))).geometry.coordinates, [121, 25]);
assert.deepEqual(parse(blob(1001, point(121, 25, 12))).geometry.coordinates, [121, 25, 12]);

const collection = new Uint8Array(25), collectionView = new DataView(collection.buffer);
collectionView.setUint32(0, 1, true); collection[4] = 0x69; collectionView.setUint32(5, 1, true); collection.set(point(120, 23), 9);
assert.deepEqual(parse(blob(7, collection)).geometry, { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [120, 23] }] });

const compressed = new Uint8Array(44), compressedView = new DataView(compressed.buffer);
compressedView.setUint32(0, 3, true); compressedView.setFloat64(4, 0, true); compressedView.setFloat64(12, 0, true);
compressedView.setFloat32(20, 1.5, true); compressedView.setFloat32(24, 2.5, true); compressedView.setFloat64(28, 5, true); compressedView.setFloat64(36, 6, true);
assert.deepEqual(parse(blob(1000002, compressed)).geometry.coordinates, [[0, 0], [1.5, 2.5], [5, 6]]);

const tiny = new Uint8Array(40), tinyView = new DataView(tiny.buffer);
tiny[0] = 0; tiny[1] = 0x81; tinyView.setInt32(2, 4326, true); tiny[6] = 4;
[120, 23, 4, 5].forEach((value, index) => tinyView.setFloat64(7 + index * 8, value, true));
tiny[tiny.length - 1] = 0xfe;
assert.deepEqual(parse(tiny).geometry.coordinates, [120, 23, 4, 5]);
assert.throws(() => parse(new Uint8Array([0, 1, 0xfe])), /SpatiaLite/);
console.log('SpatiaLite geometry checks passed');
