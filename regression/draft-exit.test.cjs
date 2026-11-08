const test=require('node:test'),assert=require('node:assert/strict');
const {boot}=require('./harness.cjs');
// JSDOM verifies the actual event wiring and cancellation, not native prompt UI.
test('editor exit protection follows title, row, invalid and reverted input',async()=>{
 const h=await boot();try{
  assert.equal(h.before(),false);h.click('edit');assert.equal(h.before(),false);
  const title=h.$('draft-title').value;
  h.type(h.$('draft-title'),'New title');assert.equal(h.store.warning,'');assert.equal(h.before(),true);
  h.type(h.$('draft-title'),title);assert.equal(h.before(),false);
  h.click('add-row');assert.equal(h.before(),true);
  h.$('draft-rows').lastElementChild.querySelector('button').click();assert.equal(h.before(),false);
  h.$('draft-rows').firstElementChild.querySelector('button').click();assert.equal(h.before(),true);
  h.click('undo-remove');assert.equal(h.before(),false);
  const quantity=h.$('draft-rows').firstElementChild.querySelector('[data-field=quantity]'),original=quantity.value;
  h.type(quantity,'1/');h.submit('recipe-form');assert.equal(h.$('editor').open,true);assert.equal(h.before(),true);
  h.type(quantity,original);assert.equal(h.before(),false);
  h.type(h.$('draft-base'),'');h.submit('recipe-form');assert.equal(h.before(),true);
 }finally{h.close();}
});
test('reset, apply and discard clear only draft exit protection after confirmation',async()=>{
 const h=await boot();try{
  h.click('edit');h.click('cancel-editor');assert.equal(h.before(),false);
  h.click('edit');h.type(h.$('draft-title'),'Reset me');h.click('reset-draft');assert.equal(h.before(),true);
  h.click('keep-editing');assert.equal(h.before(),true);
  h.click('reset-draft');h.click('confirm-decision');assert.equal(h.before(),false);
  h.type(h.$('draft-title'),'Applied');h.submit('recipe-form');assert.equal(h.store.recipe.title,'Applied');assert.equal(h.before(),false);
  h.click('edit');h.type(h.$('draft-title'),'Discard me');h.click('cancel-editor');assert.equal(h.before(),true);
  h.click('confirm-decision');assert.equal(h.store.draft,null);assert.equal(h.before(),false);
  h.type(h.$('target'),'1/');h.click('edit');h.type(h.$('draft-title'),'Pending target stays');
  h.click('cancel-editor');h.click('confirm-decision');assert.equal(h.before(),true);
  h.type(h.$('target'),h.store.recipe.targetPortions);assert.equal(h.before(),false);
 }finally{h.close();}
});
test('healthy-storage recovered draft warns before Resume and after Resume',async()=>{
 let h=await boot();try{
  h.click('edit');h.type(h.$('draft-title'),'Recover me');
  const recipe=h.store.recipe,saved=h.w.sessionStorage.getItem(h.state.DRAFT_KEY);
  h.close();h=await boot(recipe,saved);
  assert.equal(h.store.warning,'');assert.equal(h.$('editor').open,false);assert.equal(h.before(),true);
  h.click('resume-draft');assert.equal(h.$('draft-title').value,'Recover me');assert.equal(h.before(),true);
  h.submit('recipe-form');assert.equal(h.before(),false);
 }finally{h.close();}
});
test('session storage failure protects dirty edits without making pristine drafts warn',async()=>{
 const h=await boot();try{
  const proto=Object.getPrototypeOf(h.w.sessionStorage),save=proto.setItem;
  proto.setItem=function(key,value){if(this===h.w.sessionStorage)throw Error('Injected session quota');return save.call(this,key,value);};
  try{
   h.click('edit');assert.ok(h.store.warning);assert.equal(h.before(),false);
   h.type(h.$('draft-title'),'Unsaved draft');assert.equal(h.before(),true);
   h.click('reset-draft');h.click('confirm-decision');assert.equal(h.before(),false);
   h.type(h.$('draft-title'),'Durable after Apply');h.submit('recipe-form');
   assert.equal(h.store.recipeUnsaved,false);assert.equal(h.before(),false);
  }finally{proto.setItem=save;}
 }finally{h.close();}
});
