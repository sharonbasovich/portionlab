import test from 'node:test';
import assert from 'node:assert/strict';
import {sample,clone,validateRecipe,exportRecipe,importRecipe,MAX_FILE_BYTES,MAX_INGREDIENTS} from '../core.js';
import {createStore,RECIPE_KEY} from '../state.js';
const bytes=s=>new TextEncoder().encode(s).length;
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const compact=r=>JSON.stringify({format:'portionlab',version:1,recipe:r});
const failure=()=>({...clone(sample),title:'Imported large Unicode recipe',ingredients:Array.from({length:80},()=>({name:'\ud800'.repeat(155),unit:'\ud800'.repeat(40),quantity:'1'}))});

test('previously accepted compact input can reimport its unchanged larger export',()=>{
 const r=failure(),input=compact(r),out=exportRecipe(r);
 assert.equal(bytes(input),96702);assert.equal(bytes(out),100268);
 assert.deepEqual(importRecipe(input),r);assert.deepEqual(importRecipe(out),r);
});
test('large recipe persists, survives reload and remains exactly downloadable',()=>{
 const disk=memory(),store=createStore(disk,memory()),r=failure();
 store.commit(importRecipe(compact(r)));assert.equal(store.recipeUnsaved,false);
 assert.equal(bytes(disk.getItem(RECIPE_KEY)),100268);
 const restored=createStore(disk,memory());assert.equal(restored.warning,'');
 assert.deepEqual(restored.recipe,r);assert.deepEqual(importRecipe(exportRecipe(restored.recipe)),r);
});
test('schema maximum proof covers all pretty serialized string values',()=>{
 assert.equal(MAX_INGREDIENTS,80);assert.equal(MAX_FILE_BYTES,150000);
 const empty={title:'',basePortions:'',targetPortions:'',ingredients:Array.from({length:80},()=>({quantity:'',unit:'',name:''}))};
 assert.equal(bytes(JSON.stringify({format:'portionlab',version:1,recipe:empty},null,2)+'\n'),6557);
 assert.equal((100+48+48+80*(48+40+160))*6+6557,126773);
 assert.ok(126773<MAX_FILE_BYTES);
 // Every string is at its schema maximum. Quantity strings remain parseable.
 for(const token of ['\ud800','\udfff','漢','\\','"','\t','\r','\n','😀']){
  const fill=n=>token.repeat(n).slice(0,n);
  const r={title:fill(99)+'X',basePortions:' '.repeat(47)+'1',targetPortions:' '.repeat(47)+'2',ingredients:Array.from({length:80},()=>({quantity:' '.repeat(47)+'1',unit:fill(40),name:fill(159)+'X'}))};
  assert.deepEqual(validateRecipe(r),r);const out=exportRecipe(r);
  assert.ok(bytes(out)<=126773);assert.deepEqual(importRecipe(out),r);
  const disk=memory(),s=createStore(disk,memory());s.commit(r);assert.deepEqual(createStore(disk,memory()).recipe,r);
 }
});
test('inclusive byte ceiling accepts exact boundary and rejects one additional byte',()=>{
 const raw=exportRecipe(sample),exact=raw+' '.repeat(MAX_FILE_BYTES-bytes(raw));
 assert.equal(bytes(exact),MAX_FILE_BYTES);assert.deepEqual(importRecipe(exact),sample);
 assert.throws(()=>importRecipe(exact+' '),/at most 150,000 UTF-8 bytes/);
 const r={...clone(sample),title:'漢'.repeat(100)},multi=exportRecipe(r);
 assert.ok(bytes(multi)>multi.length);
 assert.deepEqual(importRecipe(multi+' '.repeat(MAX_FILE_BYTES-bytes(multi))),r);
 assert.throws(()=>importRecipe(multi+' '.repeat(MAX_FILE_BYTES-multi.length)),/150,000/);
});
