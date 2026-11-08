const test=require('node:test'),assert=require('node:assert/strict');
const {boot}=require('./harness.cjs');
test('file chooser accepts large valid export and enforces inclusive byte ceiling',async()=>{
 const h=await boot();try{
  const r={...h.store.recipe,title:'Large exact backup',ingredients:Array.from({length:80},()=>({quantity:'1',unit:'\ud800'.repeat(40),name:'\ud800'.repeat(155)}))};
  await h.importFile(r);assert.deepEqual(h.store.recipe,r);
  const raw=h.core.exportRecipe(r),limit=h.core.MAX_FILE_BYTES;
  const run=async(text,size)=>{Object.defineProperty(h.$('file'),'files',{configurable:true,value:[{size,text:async()=>text}]});h.$('file').dispatchEvent(new h.w.Event('change'));await new Promise(r=>setImmediate(r));};
  await run(raw+' '.repeat(limit-Buffer.byteLength(raw)),limit);
  assert.equal(h.$('apply-import').disabled,false);h.click('cancel-import');
  await run(raw,limit+1);assert.equal(h.$('apply-import').disabled,true);
  assert.match(h.$('import-error').textContent,/at most 150,000 UTF-8 bytes/);
  assert.deepEqual(h.store.recipe,r);
 }finally{h.close();}
});
