import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore,RECIPE_KEY,DRAFT_KEY} from '../state.js';
import {sample,clone,exportRecipe,importRecipe} from '../core.js';
function memory(seed={}){const data=new Map(Object.entries(seed));return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}

test('incomplete draft survives reload, unrelated main reads and reset cancellation',()=>{
  const disk=memory(),session=memory(),s=createStore(disk,session);
  const draft=s.begin();draft.title='';draft.ingredients[0].quantity='1/';draft.ingredients.push({quantity:'',unit:'',name:''});s.edit(draft);
  const interrupted=createStore(disk,session);assert.deepEqual(interrupted.draft.recipe,draft);assert.deepEqual(interrupted.recipe,sample);
  // Reading active state for a UI rerender does not mutate the in-progress draft.
  interrupted.recipe;interrupted.previous;interrupted.warning;assert.deepEqual(interrupted.begin(),draft);
  assert.throws(()=>interrupted.commit(draft,{fromDraft:true}));assert.deepEqual(interrupted.draft.recipe,draft);
  assert.equal(interrupted.draftDirty(),true);
  assert.deepEqual(interrupted.reset(),sample);assert.equal(interrupted.draftDirty(),false);
  assert.deepEqual(interrupted.recipe,sample);
});
test('cancel/discard is isolated, commit applies atomically and undo restores original',()=>{
  const disk=memory(),session=memory(),s=createStore(disk,session);
  const draft=s.begin();draft.title='My recipe';draft.ingredients.splice(0,1);s.edit(draft);s.discard();assert.deepEqual(s.recipe,sample);
  assert.equal(session.getItem(DRAFT_KEY),null);
  s.begin();s.edit(draft);s.commit(draft,{fromDraft:true});assert.deepEqual(s.recipe,draft);assert.equal(s.draft,null);
  assert.deepEqual(importRecipe(disk.getItem(RECIPE_KEY)),draft);
  s.undo();assert.deepEqual(s.recipe,sample);assert.equal(s.previous,null);
});
test('failed validation never destroys previous recipe or recovery history',()=>{
  const s=createStore(memory(),memory());s.commit({...clone(sample),title:'Changed'});const before=s.recipe,previous=s.previous;
  assert.throws(()=>s.commit({...before,basePortions:'0'}));assert.deepEqual(s.recipe,before);assert.deepEqual(s.previous,previous);
});
test('stale draft cannot overwrite a changed applied recipe',()=>{
  const s=createStore(memory(),memory()),draft=s.begin();draft.title='Draft';s.edit(draft);
  s.commit({...s.recipe,targetPortions:'7'});assert.throws(()=>s.commit(draft,{fromDraft:true}),/changed after/);
  assert.equal(s.recipe.targetPortions,'7');assert.equal(s.draft.recipe.title,'Draft');
});
test('external-tab changes are detected before overwrite and retain local work',()=>{
  const disk=memory(),s=createStore(disk,memory()),draft=s.begin();draft.title='Unfinished';s.edit(draft);
  const external={...clone(sample),title:'Another tab'};disk.setItem(RECIPE_KEY,exportRecipe(external));
  assert.throws(()=>s.commit({...s.recipe,title:'Local'}),/Another tab/);
  assert.deepEqual(s.recipe,sample);assert.equal(s.draft.recipe.title,'Unfinished');assert.equal(s.conflict,true);
  assert.deepEqual(importRecipe(disk.getItem(RECIPE_KEY)),external);
});
test('storage failure is explicit while in-memory recipe remains usable',()=>{
  const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('quota');},removeItem(){throw new Error('blocked');}};
  const s=createStore(blocked,blocked);assert.match(s.warning,/could not be read/);
  s.begin();const next={...s.recipe,title:'Still usable'};s.edit(next);s.commit(next,{fromDraft:true});assert.equal(s.recipe.title,'Still usable');assert.match(s.warning,/storage/i);
});
test('corrupt saved JSON does not get silently overwritten on startup',()=>{
  const disk=memory({[RECIPE_KEY]:'{"broken":'}),s=createStore(disk,memory());assert.deepEqual(s.recipe,sample);assert.equal(disk.getItem(RECIPE_KEY),'{"broken":');assert.match(s.warning,/could not be read/);
});
test('malformed interrupted draft is reported without crashing or deleting bytes',()=>{
  const raw=JSON.stringify({recipe:{title:17},opening:sample,baseSnapshot:exportRecipe(sample)}),session=memory({[DRAFT_KEY]:raw});
  const s=createStore(memory(),session);assert.equal(s.draft,null);assert.match(s.warning,/Draft storage/);assert.equal(session.getItem(DRAFT_KEY),raw);
});
test('explicitly reviewed stale-draft replacement retains current recipe for undo',()=>{
  const s=createStore(memory(),memory()),draft=s.begin();draft.title='Recovered';s.edit(draft);
  s.commit({...s.recipe,targetPortions:'9'});
  assert.throws(()=>s.commit(draft,{fromDraft:true}));
  s.commit(draft,{fromDraft:true,replaceStaleDraft:true});assert.equal(s.recipe.title,'Recovered');assert.equal(s.previous.targetPortions,'9');
  s.undo();assert.equal(s.recipe.targetPortions,'9');
});
