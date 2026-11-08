const {test}=require('node:test'),assert=require('node:assert/strict');
const {boot,recipe}=require('./harness.cjs');
const plain=()=>({...recipe(),basePortions:'4',targetPortions:'6'});
test('Undo reconciles exact raw target without losing a real pending edit',async()=>{
 const h=await boot(plain());try{
  h.type(h.$('target'),'8');h.submit('scale-form');
  h.type(h.$('target'),'6');assert.equal(h.before(),true);
  h.click('undo');assert.equal(h.$('target-pending').hidden,true);assert.equal(h.before(),false);
  h.type(h.$('target'),'8');h.submit('scale-form');h.type(h.$('target'),'6.0');h.click('undo');
  assert.equal(h.$('target').value,'6.0');assert.equal(h.$('target-pending').hidden,false);assert.equal(h.before(),true);
 }finally{h.close()}
});
test('import reconciles equal target and retains blank, invalid and text-distinct edits',async()=>{
 for(const typed of ['9','','oops','9.0']){
  const h=await boot(plain());try{
   h.type(h.$('target'),typed);await h.importFile({...plain(),targetPortions:'9'});
   assert.equal(h.$('target-pending').hidden,typed==='9');assert.equal(h.before(),typed!=='9');
   assert.equal(h.$('target').value,typed);
  }finally{h.close()}
 }
});
test('newline target survives unchanged import, resize, reverted input and Update',async()=>{
 const r=recipe('\r\n'),h=await boot(r);try{
  h.type(h.$('target'),'3');h.type(h.$('target'),'2 1/2');assert.equal(h.before(),false);
  await h.importFile(r);h.w.dispatchEvent(new h.w.Event('resize'));h.submit('scale-form');
  assert.deepEqual(h.store.recipe,r);assert.equal(h.store.previous,null);assert.equal(h.before(),false);
 }finally{h.close()}
});
test('reconciled target does not hide unsaved recipe after failed import or Undo',async()=>{
 const h=await boot(plain());try{
  const proto=Object.getPrototypeOf(h.w.localStorage),save=proto.setItem;
  proto.setItem=function(){throw Error('Injected quota failure')};
  h.type(h.$('target'),'8');h.submit('scale-form');
  h.type(h.$('target'),'10');h.submit('scale-form');
  h.type(h.$('target'),'8');h.click('undo');
  assert.equal(h.$('target-pending').hidden,true);assert.equal(h.store.recipeUnsaved,true);assert.equal(h.before(),true);
  h.type(h.$('target'),'9');await h.importFile({...plain(),targetPortions:'9'});
  assert.equal(h.$('target-pending').hidden,true);assert.equal(h.before(),true);
  proto.setItem=save;h.submit('scale-form');assert.equal(h.store.recipeUnsaved,false);assert.equal(h.before(),false);
 }finally{h.close()}
});
