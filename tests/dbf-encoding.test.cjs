const assert = require('node:assert/strict');
const { choose } = require('../js/parsers/dbf-encoding.js');
function dbf(value) {
  const buffer = new ArrayBuffer(82);
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  view.setUint32(4, 1, true); view.setUint16(8, 65, true); view.setUint16(10, 17, true);
  bytes[32] = 65; bytes[43] = 67; bytes[48] = 16; bytes[64] = 13;
  bytes.fill(32, 65); bytes.set(value, 66);
  return buffer;
}
const big5 = dbf([0xa4,0xa4,0xa4,0xe5]); // 中文
const utf8 = dbf(new TextEncoder().encode('中文'));
assert.equal(choose(big5).encoding, 'big5');
assert.equal(choose(utf8).encoding, 'utf-8');
assert.equal(choose(dbf([65])).encoding, 'utf-8');
assert.equal(choose(big5, new TextEncoder().encode('65001')).encoding, 'utf-8');
assert.equal(choose(utf8, new TextEncoder().encode('950')).encoding, 'big5');
assert.equal(choose(big5, null, 'utf-8').encoding, 'utf-8');
assert.equal(choose(utf8, new TextEncoder().encode('65001'), 'big5').encoding, 'big5');
assert.throws(()=>choose(big5, new TextEncoder().encode('invalid-code-page')));
assert.throws(()=>choose(new ArrayBuffer(4)));
assert.throws(()=>choose(dbf([129,32])));
console.log('UTF-8 / Big5 / CPG / manual override checks passed');
