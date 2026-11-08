const {test}=require('node:test'),assert=require('node:assert/strict');
const {boot,recipe}=require('./harness.cjs');
for(const nl of ['\n','\r','\r\n']){
 test('raw quantity and label preservation '+JSON.stringify(nl),async()=>{
  const original=recipe(nl),h=await boot(original);
  try{
   assert.equal(h.$('target').value,'2 1/2');
   h.submit('scale-form');assert.deepEqual(h.store.recipe,original);assert.equal(h.store.previous,null);
   h.click('edit');
   assert.equal(h.$('draft-title').value,'Evening meal');
   assert.equal(h.$('draft-base').value,'1 1/2');
   for(const selector of ['draft-title','draft-base']){const input=h.$(selector),v=input.value;h.type(input,v+'x');h.type(input,v)}
   const row=h.$('draft-rows').children[0];
   for(const field of ['quantity','unit','name']){const input=row.querySelector('[data-field='+field+']'),v=input.value;h.type(input,v+'x');h.type(input,v)}
   h.submit('recipe-form');assert.deepEqual(h.store.recipe,original);assert.equal(h.store.previous,null);
   h.click('edit');h.type(h.$('draft-rows').children[1].querySelector('[data-field=name]'),'pepper');
   h.click('add-row');h.$('draft-rows').lastElementChild.querySelector('button').click();
   h.submit('recipe-form');
   const edited=structuredClone(original);edited.ingredients[1].name='pepper';
   assert.deepEqual(h.store.recipe,edited);
   h.click('undo');assert.deepEqual(h.store.recipe,original);
   h.click('edit');h.click('cancel-editor');assert.equal(h.$('editor').open,false);assert.equal(h.store.draft,null);
  }finally{h.close()}
 });
 test('recovery, removal Undo, reset and real edits '+JSON.stringify(nl),async()=>{
  const original=recipe(nl);let h=await boot(original);
  try{
   h.click('edit');h.type(h.$('draft-rows').children[1].querySelector('[data-field=name]'),'pepper');
   const saved=h.w.sessionStorage.getItem(h.state.DRAFT_KEY);h.close();h=await boot(original,saved);
   h.click('resume-draft');h.$('draft-rows').children[0].querySelector('button').click();h.click('undo-remove');
   h.click('reset-draft');h.click('confirm-decision');
   h.submit('recipe-form');assert.deepEqual(h.store.recipe,original);
   h.click('edit');h.type(h.$('draft-title'),'New title');h.type(h.$('draft-base'),'4');
   h.type(h.$('draft-rows').children[0].querySelector('[data-field=quantity]'),'3/4');
   h.type(h.$('draft-rows').children[0].querySelector('[data-field=unit]'),'grams');
   h.type(h.$('draft-rows').children[0].querySelector('[data-field=name]'),'flour');
   h.submit('recipe-form');
   assert.equal(h.store.recipe.title,'New title');assert.equal(h.store.recipe.basePortions,'4');
   assert.deepEqual(h.store.recipe.ingredients[0],{quantity:'3/4',unit:'grams',name:'flour'});
  }finally{h.close()}
 });
}
