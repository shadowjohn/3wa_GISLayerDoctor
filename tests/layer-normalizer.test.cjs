const assert = require('node:assert/strict');
const { summarize } = require('../js/layer-normalizer.js');
const result = summarize({type:'FeatureCollection',features:[
  {geometry:{type:'Point',coordinates:[121,25]},properties:{name:'<img src=x onerror=alert(1)>'}},
  {geometry:{type:'GeometryCollection',geometries:[{type:'LineString',coordinates:[[120,24],[122,26]]}]},properties:{name:'B'}},
  {geometry:null,properties:{}}
]}, 'test', ['warning']);
assert.deepEqual(result.bounds,[120,24,122,26]);
assert.equal(result.count,3);
assert.equal(result.preview[0][0],'<img src=x onerror=alert(1)>');
assert.ok(result.types.includes('Null'));
assert.deepEqual(summarize({type:'FeatureCollection',features:[]},'empty',[]).bounds,null);
assert.throws(()=>summarize({},'bad',[]));
console.log('LayerNormalizer checks passed');

global.includeMap = true;
const large = summarize({ type: 'FeatureCollection', features: Array.from({length:10001}, (_,i) => ({
  type:'Feature', geometry:{type:'Point',coordinates:[120+i/100000,25]}, properties:{name:'<img onerror=1>'}
})) }, 'large', []);
assert.equal(large.count,10001);
assert.equal(large.mapData.collection.features.length,10001);
assert.equal(large.mapData.total,10001);
assert.equal(large.mapData.collection.features[0].properties.name,'<img onerror=1>');
global.includeMap = false;
console.log('Full map data checks passed');
