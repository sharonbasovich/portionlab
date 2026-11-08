import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStore,RECIPE_KEY} from '../state.js';
import {exportRecipe} from '../core.js';

// Exercise the shipped handler, not a duplicate of its guard expression.
// Cancellation/returnValue are requests; this cannot prove a native prompt appears.
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const body=/window\.addEventListener\('beforeunload',event=>\{([\s\S]*?)\n\}\);/.exec(source)?.[1];
assert.ok(body,'beforeunload callback found');
const run=new Function('store','targetDirty','event',body);
function warns(store,targetDirty=false){
  const event={returnValue:undefined,preventDefault(){this.prevented=true;}};
  run(store,targetDirty,event);
  if(event.prevented)assert.equal(event.returnValue,'');
  else assert.equal(event.returnValue,undefined);
  return event.prevented===true;
}
function memory(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}

test('healthy-storage drafts request exit protection only while dirty',()=>{
  const disk=memory(),session=memory(),store=createStore(disk,session);
  assert.equal(warns(store),false);
  store.begin();assert.equal(warns(store),false);
  for(const edit of [r=>r.title='Edited title',r=>r.ingredients.push({quantity:'',unit:'',name:''}),r=>r.ingredients[0].quantity='1/',r=>r.basePortions='']){
    const draft=store.begin();edit(draft);store.edit(draft);
    assert.equal(store.warning,'');assert.equal(warns(store),true);
    store.reset();assert.equal(warns(store),false);
  }
  const original=store.begin(),changed=structuredClone(original);changed.title='Temporary';store.edit(changed);
  store.edit(original);assert.equal(warns(store),false);
  changed.title='Applied';store.edit(changed);store.commit(changed,{fromDraft:true});
  assert.equal(warns(store),false);assert.equal(store.draft,null);
  const discarded=store.begin();discarded.title='Discarded';store.edit(discarded);store.discard();
  assert.equal(warns(store),false);
});

test('same-tab reload keeps dirty draft protected; fresh session does not recover it',()=>{
  const disk=memory(),session=memory(),store=createStore(disk,session);
  disk.setItem(RECIPE_KEY,exportRecipe(store.recipe));
  const draft=store.begin();draft.ingredients[0].quantity='1/';store.edit(draft);
  const reload=createStore(disk,session);
  assert.equal(reload.warning,'');assert.equal(reload.draft.recipe.ingredients[0].quantity,'1/');assert.equal(warns(reload),true);
  const fresh=createStore(disk,memory());assert.equal(fresh.draft,null);assert.equal(warns(fresh),false);
});

test('pending targets and unsaved applied recipes remain independent of draft cleanup',()=>{
  const disk=memory(),store=createStore(disk,memory());
  assert.equal(warns(store,true),true);
  store.begin();store.discard();assert.equal(warns(store,true),true);
  disk.setItem=()=>{throw Error('quota');};
  store.commit({...store.recipe,title:'Unsaved A'});store.commit({...store.recipe,title:'Unsaved B'});store.undo();
  assert.equal(store.recipeUnsaved,true);assert.equal(warns(store),true);
  store.begin();store.discard();assert.equal(warns(store),true);
});

test('storage warning alone does not warn, but failed-storage dirty drafts do',()=>{
  const session={...memory(),setItem(){throw Error('quota');}},store=createStore(memory(),session);
  store.begin();assert.ok(store.warning);assert.equal(warns(store),false);
  const draft=store.begin();draft.title='At risk';store.edit(draft);assert.equal(warns(store),true);
  store.reset();assert.equal(warns(store),false);
  store.edit(draft);store.discard();assert.equal(warns(store),false);
});
