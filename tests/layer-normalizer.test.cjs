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
assert.ok(large.mapData.collection.features.length <= 5000);
assert.equal(large.mapData.total,10001);
assert.equal(large.mapData.collection.features[0].properties.name,'<img onerror=1>');
global.includeMap = false;
console.log('Bounded map preview checks passed');

const { sampleMapFeatures } = require('../js/layer-normalizer.js');
const features = Array.from({length:3271}, (_,i) => ({
  type:'Feature', geometry:{type:'LineString',coordinates:Array.from({length:50},()=>[121,25])}, properties:{id:i}
}));
const sampled = sampleMapFeatures(features, 500, 20000);
assert.equal(sampled.length,400); // Vertex budget takes precedence over feature budget.
assert.equal(sampled[1],features[7]); // Keep properties attached to the sampled geometry.
assert.equal(features.length,3271);
assert.deepEqual(sampleMapFeatures([],500,20000),[]);
assert.deepEqual(sampleMapFeatures([{geometry:{type:'GeometryCollection',geometries:[features[0].geometry]}}],500,49),[]);
console.log('Smooth map preview checks passed');
