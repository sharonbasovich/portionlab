import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore,RECIPE_KEY,DRAFT_KEY} from '../state.js';
import {sample,clone,exportRecipe,importRecipe} from '../core.js';

function memory(seed={}) {
  const data=new Map(Object.entries(seed));
  return {fail:false,writes:0,getItem:k=>data.get(k)??null,
    setItem(k,v){if(this.fail)throw Error('quota');this.writes++;data.set(k,v);},
    removeItem(k){if(this.fail)throw Error('quota');data.delete(k);}};
}
function setup(){const disk=memory(),session=memory();return {disk,session,s:createStore(disk,session)};}

test('unchanged portions create no phantom Undo and retain the useful earlier change',()=>{
  const {s}=setup();s.commit(s.recipe);assert.equal(s.previous,null);
  const original=s.recipe;s.commit({...s.recipe,targetPortions:'9'});
  for(let i=0;i<5;i++){s.commit({...s.recipe});assert.deepEqual(s.previous,original);}
  s.undo();assert.deepEqual(s.recipe,original);assert.equal(s.previous,null);
});

test('unchanged recipe Apply clears its draft without consuming useful Undo',()=>{
  const {s,session}=setup(),original=s.recipe;s.commit({...s.recipe,title:'My supper'});
  const draft=s.begin();draft.title='Temporary draft';s.edit(draft);s.reset();
  s.commit(s.draft.recipe,{fromDraft:true});
  assert.equal(s.draft,null);assert.equal(session.getItem(DRAFT_KEY),null);
  assert.deepEqual(s.previous,original);s.undo();assert.deepEqual(s.recipe,original);
});

test('an identical imported file retains the previous recipe for Undo',()=>{
  const {s}=setup(),original=s.recipe;s.commit({...s.recipe,title:'Imported supper'});
  s.commit(importRecipe(exportRecipe(s.recipe)));assert.deepEqual(s.previous,original);
  s.undo();assert.deepEqual(s.recipe,original);
});

test('canonical object order is unchanged, but exact user spelling is undoable',()=>{
  const {s}=setup();s.commit({...s.recipe,targetPortions:'9'});const previous=s.previous,current=s.recipe;
  s.commit({ingredients:current.ingredients.map(({name,unit,quantity})=>({name,unit,quantity})),targetPortions:current.targetPortions,basePortions:current.basePortions,title:current.title});
  assert.deepEqual(s.previous,previous);
  s.commit({...current,targetPortions:'9.0'});assert.deepEqual(s.previous,current);
  s.undo();assert.deepEqual(s.recipe,current);
});

test('unchanged commits retry failed storage writes without replacing Undo',()=>{
  const {s,disk}=setup(),original=s.recipe;disk.fail=true;
  s.commit({...s.recipe,targetPortions:'9'});assert.equal(s.recipeUnsaved,true);
  s.commit(s.recipe);assert.equal(s.recipeUnsaved,true);assert.deepEqual(s.previous,original);
  disk.fail=false;s.commit(s.recipe);
  assert.equal(s.recipeUnsaved,false);assert.deepEqual(importRecipe(disk.getItem(RECIPE_KEY)),s.recipe);
  assert.deepEqual(s.previous,original);s.undo();assert.deepEqual(s.recipe,original);
});

test('unchanged Apply retains warning/history if removing saved draft fails',()=>{
  const {s,session}=setup(),original=s.recipe;s.commit({...s.recipe,title:'Changed'});s.begin();session.fail=true;
  s.commit(s.draft.recipe,{fromDraft:true});assert.equal(s.draft,null);
  assert.match(s.warning,/Draft storage/);assert.deepEqual(s.previous,original);
});

test('failed validation and external conflict still protect history and saved bytes',()=>{
  const {s,disk}=setup();s.commit({...s.recipe,targetPortions:'9'});const current=s.recipe,previous=s.previous;
  assert.throws(()=>s.commit({...current,targetPortions:'0'}));
  assert.deepEqual(s.recipe,current);assert.deepEqual(s.previous,previous);
  const external=exportRecipe({...sample,title:'Other tab'});disk.setItem(RECIPE_KEY,external);const writes=disk.writes;
  assert.throws(()=>s.commit(current),/Another tab/);assert.equal(disk.writes,writes);
  assert.equal(disk.getItem(RECIPE_KEY),external);assert.deepEqual(s.recipe,current);assert.deepEqual(s.previous,previous);
});

test('a race detected during unchanged persist leaves recipe and Undo untouched',()=>{
  const disk=memory(),s=createStore(disk,memory());s.commit({...s.recipe,title:'Changed'});
  const current=s.recipe,previous=s.previous,read=disk.getItem,external=exportRecipe({...sample,title:'Racing tab'});
  let reads=0;disk.getItem=k=>{if(++reads===2)disk.setItem(RECIPE_KEY,external);return read(k);};
  assert.throws(()=>s.commit(current),/Another tab/);
  assert.deepEqual(s.recipe,current);assert.deepEqual(s.previous,previous);assert.equal(read(RECIPE_KEY),external);
});

test('an unchanged stale-draft replacement still requires explicit approval',()=>{
  const {s,session}=setup();s.begin();s.commit({...s.recipe,targetPortions:'9'});const previous=s.previous;
  s.edit(s.recipe);assert.throws(()=>s.commit(s.draft.recipe,{fromDraft:true}),/changed after/);
  assert.ok(s.draft);assert.deepEqual(s.previous,previous);
  s.commit(s.draft.recipe,{fromDraft:true,replaceStaleDraft:true});
  assert.equal(s.draft,null);assert.equal(session.getItem(DRAFT_KEY),null);assert.deepEqual(s.previous,previous);
});

test('seeded repeat, edit, import, failed-save and Undo transitions match an independent model',()=>{
  let seed=0x54107;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const {s,disk}=setup();let current=clone(sample),previous=null,saved=JSON.stringify(sample);
  for(let i=0;i<4000;i++){
    const action=random()%7;disk.fail=random()%4===0;
    if(action===0){
      if(previous){current=clone(previous);previous=null;if(!disk.fail)saved=JSON.stringify(current);}
      s.undo();
    }else{
      let next=clone(current);
      if(action===1)next.title=`Synthetic recipe ${random()%23}`;
      if(action===2)next.targetPortions=String(1+random()%17);
      if(action===3)next.ingredients[0].unit=random()%2?'cup':'cups';
      if(JSON.stringify(next)!==JSON.stringify(current))previous=clone(current);
      current=clone(next);if(!disk.fail)saved=JSON.stringify(current);
      if(action===4){s.begin();s.commit(s.draft.recipe,{fromDraft:true});}
      else if(action===5)s.commit(importRecipe(exportRecipe(next)));
      else s.commit(next);
    }
    assert.deepEqual(s.recipe,current,`recipe at ${i}`);assert.deepEqual(s.previous,previous,`Undo at ${i}`);
    assert.equal(s.recipeUnsaved,JSON.stringify(current)!==saved,`durability at ${i}`);
  }
});
