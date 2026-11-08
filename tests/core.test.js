import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseQuantity,scaledText,scale,rational,multiply,mixed,decimalExact,importRecipe,exportRecipe,validateRecipe,sample,clone,MAX_FILE_BYTES} from '../core.js';

test('independent acceptance examples stay exact',()=>{
  assert.equal(scaledText('1/3','3','7'),'7/9');
  assert.equal(scaledText('1 1/2','4','6'),'2 1/4');
  assert.equal(scaledText('0.1','10','3'),'0.03');
});
test('exact fractions, decimals, glyphs, and mixed numbers',()=>{
  const cases=[['½',1n,2n],['1½',3n,2n],['2 ⅓',7n,3n],['0.1',1n,10n],['.125',1n,8n],['0002',2n,1n],['6/4',3n,2n],['0',0n,1n],[' 1  1/2 ',3n,2n]];
  for(const [raw,n,d] of cases)assert.deepEqual(parseQuantity(raw),{n,d},raw);
  assert.equal(mixed(scale('1/7','1/3','2/9')),'2/21');
  assert.equal(scaledText('0.1','3','1'),'1/30');
  assert.equal(decimalExact({n:1n,d:8n}),'0.125');
});
test('malformed, signed, zero-denominator and excessive inputs are rejected',()=>{
  for(const raw of ['', ' ', '-', '-1', '+1', '1e3', 'Infinity', 'NaN', '1,000','1/0','1//2','1 / 2','1 4/3','1/','1.','1.0000001','1000000000000','1/1000000000000','9'.repeat(10000),'½½'])assert.throws(()=>parseQuantity(raw),undefined,raw.slice(0,60));
  for(const raw of ['0','0/3','0.0'])assert.throws(()=>parseQuantity(raw,{positive:true}));
  assert.throws(()=>parseQuantity(1));
});
test('large accepted arithmetic remains exact without number overflow',()=>{
  assert.equal(mixed(scale('999999999999','1/999999999999','999999999999')),'999999999997000000000002999999999999');
  assert.deepEqual(parseQuantity('999999999999'),{n:999999999999n,d:1n});
  assert.deepEqual(parseQuantity('0.000001'),{n:1n,d:1000000n});
});
test('changing targets always starts with original, not previous rounded output',()=>{
  const recipe=clone(sample),before=JSON.stringify(recipe.ingredients);
  for(const target of ['3','7','11','4'])assert.equal(scaledText('1/3','4',target),({'3':'1/4','7':'7/12','11':'11/12','4':'1/3'})[target]);
  assert.equal(JSON.stringify(recipe.ingredients),before);
});
test('units, unmeasured rows, whitespace and text survive JSON roundtrip unchanged',()=>{
  const recipe={title:'  Synthetic <b>test</b> 🍋  ',basePortions:'03',targetPortions:'7',ingredients:[{quantity:'1/3',unit:' cup (US) ',name:'fine grains'},{quantity:'0.1',unit:'kg',name:'dry peas'},{quantity:'',unit:'pinches',name:'herbs as preferred'},{quantity:'1',unit:'unfamiliar unit',name:'other'}]};
  const restored=importRecipe(exportRecipe(recipe));assert.deepEqual(restored,recipe);
  assert.equal(scaledText(restored.ingredients[0].quantity,'3','7'),'7/9');
  assert.deepEqual(restored.ingredients.map(x=>x.unit),[' cup (US) ','kg','pinches','unfamiliar unit']);
  assert.equal(scaledText('','3','7'),'As written');
});
test('invalid and oversized import rejection is atomic and strict',()=>{
  const recipe=clone(sample),before=JSON.stringify(recipe);
  const valid=JSON.parse(exportRecipe(recipe));
  const bads=['{', 'null','[]', '{}',JSON.stringify({...valid,version:2}),JSON.stringify({...valid,extra:true}),JSON.stringify({...valid,recipe:{...recipe,ingredients:[{quantity:'1/0',unit:'g',name:'invalid'}]}}),JSON.stringify({...valid,recipe:{...recipe,ingredients:Array.from({length:81},()=>recipe.ingredients[0])}}),JSON.stringify({...valid,recipe:{...recipe,title:''}}),JSON.stringify({...valid,recipe:{...recipe,title:'\u0000'}}),JSON.stringify({...valid,recipe:{...recipe,targetPortions:7}}),JSON.stringify({...valid,recipe:{...recipe,ingredients:[{quantity:'1',unit:'g'}]}}),' '.repeat(MAX_FILE_BYTES+1),JSON.stringify({...valid,recipe:{...recipe,title:'🍋'.repeat(100000)}})];
  for(const bad of bads){assert.throws(()=>importRecipe(bad));assert.equal(JSON.stringify(recipe),before);}
});
test('zero ingredients is an honest valid empty recipe',()=>{
  assert.deepEqual(validateRecipe({...clone(sample),ingredients:[]}).ingredients,[]);
});
test('sparse ingredient arrays are rejected by actual validation and export',()=>{
  const sparse=new Array(3);sparse[1]=sample.ingredients[0];
  for(const ingredients of [new Array(1),sparse,[null],[undefined]]){
    assert.throws(()=>validateRecipe({...sample,ingredients}));
    assert.throws(()=>exportRecipe({...sample,ingredients}));
  }
});
test('all exported rational helpers reject invalid denominators without looping',()=>{
  for(const value of [{n:1n,d:0n},{n:0n,d:0n},{n:1n,d:-1n},{n:-1n,d:1n},{n:1,d:2},{n:1n},null]){
    assert.throws(()=>mixed(value));assert.throws(()=>decimalExact(value));assert.throws(()=>multiply(value,{n:1n,d:1n}));
  }
  assert.throws(()=>rational(1n,0n));assert.throws(()=>rational(1,2));
  assert.equal(decimalExact({n:2n,d:4n}),'0.5');assert.equal(mixed({n:6n,d:4n}),'1 1/2');
});
test('5000 seeded fraction scenarios checked by independent cross-products',()=>{
  let seed=0x42ab3921;
  function next(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return BigInt(seed%100000+1);}
  for(let i=0;i<5000;i++){
    const qn=next(),qd=next(),bn=next(),bd=next(),tn=next(),td=next();
    const actual=scale(`${qn}/${qd}`,`${bn}/${bd}`,`${tn}/${td}`);
    // Expected products are formed directly from the generated integers,
    // without calling the app's parser, reducer or formatter as an oracle.
    assert.equal(actual.n*(qd*td*bn),actual.d*(qn*tn*bd),`seeded case ${i}`);
  }
});
