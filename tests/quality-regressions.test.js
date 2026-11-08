import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseQuantity,validateRecipe,importRecipe,exportRecipe,sample,clone} from '../core.js';
import {createStore,RECIPE_KEY} from '../state.js';

const glyphs=[['¼',1n,4n],['½',1n,2n],['¾',3n,4n],['⅐',1n,7n],['⅑',1n,9n],['⅒',1n,10n],['⅓',1n,3n],['⅔',2n,3n],['⅕',1n,5n],['⅖',2n,5n],['⅗',3n,5n],['⅘',4n,5n],['⅙',1n,6n],['⅚',5n,6n],['⅛',1n,8n],['⅜',3n,8n],['⅝',5n,8n],['⅞',7n,8n]];

test('all supported glyphs accept only a complete standalone or mixed quantity',()=>{
  for(const [glyph,n,d] of glyphs){
    for(const raw of [glyph,` ${glyph} `])assert.deepEqual(parseQuantity(raw),{n,d},raw);
    for(const raw of [`2${glyph}`,`2 ${glyph}`,` 2\t${glyph} `])assert.deepEqual(parseQuantity(raw),{n:2n*d+n,d},raw);
    for(const raw of [`${glyph}1`,`1${glyph}2`,`${glyph}0`,`2${glyph}4`,`${glyph}/2`,`1/${glyph}`,`0.1${glyph}`,`${glyph}${glyph}`])assert.throws(()=>parseQuantity(raw),undefined,raw);
  }
});

test('glyph suffix typos reject atomically in ingredient and portion import fields',()=>{
  for(const raw of ['½1','1½2','¼0','2⅓4']){
    for(const field of ['basePortions','targetPortions','quantity']){
      const recipe=clone(sample);
      if(field==='quantity')recipe.ingredients[0].quantity=raw;else recipe[field]=raw;
      const before=JSON.stringify(recipe);
      assert.throws(()=>validateRecipe(recipe));
      assert.throws(()=>exportRecipe(recipe));
      assert.throws(()=>importRecipe(JSON.stringify({format:'portionlab',version:1,recipe})));
      assert.equal(JSON.stringify(recipe),before);
    }
  }
});

function memory(seed={}){
  const data=new Map(Object.entries(seed));
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
}
function failingWrites(seed={}){
  const disk=memory(seed);let fail=true;
  return {...disk,setItem(key,value){if(fail)throw Error('quota');disk.setItem(key,value);},recover(){fail=false;}};
}

test('undo retains unsaved recipe state after repeated failed writes',()=>{
  const disk=failingWrites(),session=memory(),store=createStore(disk,session);
  assert.equal(store.recipeUnsaved,false);
  store.commit({...store.recipe,title:'Unsaved recipe A'});
  store.commit({...store.recipe,title:'Unsaved recipe B'});
  store.undo();
  assert.equal(store.recipe.title,'Unsaved recipe A');
  assert.equal(store.previous,null);
  assert.equal(store.recipeUnsaved,true);
  assert.equal(createStore(disk,session).recipe.title,sample.title);
});

test('unsaved comparison follows the last durable recipe, not undo or warning text',()=>{
  const original={...clone(sample),title:'Durable A'};
  const disk=failingWrites({[RECIPE_KEY]:exportRecipe(original)}),store=createStore(disk,memory());
  assert.equal(store.recipeUnsaved,false);
  store.commit({...store.recipe,title:'Unsaved B'});
  assert.equal(store.recipeUnsaved,true);
  store.undo();
  assert.equal(store.recipeUnsaved,false);
  store.commit({...store.recipe,title:'Unsaved C'});
  assert.throws(()=>store.commit({...store.recipe,targetPortions:'½1'}));
  assert.equal(store.recipeUnsaved,true);
  disk.recover();store.commit(store.recipe);
  assert.equal(store.recipeUnsaved,false);
  assert.equal(createStore(disk,memory()).recipe.title,'Unsaved C');
  assert.match(store.warning,/storage/i);
});

test('actual app unload callback warns after failed-write undo and clears after recovery',()=>{
  // Execute the actual callback body with injected state and a cancellable event.
  // This verifies app wiring, not native browser prompt policy or rendering.
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const body=/window\.addEventListener\('beforeunload',event=>\{([\s\S]*?)\n\}\);/.exec(source)?.[1];
  assert.ok(body,'beforeunload callback found');
  const run=new Function('store','targetDirty','event',body);
  function warns(store,targetDirty=false){const event={preventDefault(){this.prevented=true;}};run(store,targetDirty,event);return event.prevented===true;}
  const disk=failingWrites(),store=createStore(disk,memory());
  assert.equal(warns(store),false);assert.equal(warns(store,true),true);
  store.commit({...store.recipe,title:'A'});store.commit({...store.recipe,title:'B'});store.undo();
  assert.equal(warns(store),true);
  disk.recover();store.commit(store.recipe);assert.equal(warns(store),false);
  const draft=store.begin();draft.ingredients[0].quantity='1/';store.edit(draft);
  assert.equal(warns(store),true);
});
