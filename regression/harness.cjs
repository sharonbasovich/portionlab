const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const root=path.resolve(process.env.APP_ROOT||path.join(__dirname,'..'));
async function boot(recipe,sessionData){
 const core=await import(pathToFileURL(path.join(root,'core.js')));
 const state=await import(pathToFileURL(path.join(root,'state.js')));
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only'});
 const w=dom.window,$=id=>w.document.getElementById(id);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false};
 if(recipe)w.localStorage.setItem(state.RECIPE_KEY,core.exportRecipe(recipe));
 if(sessionData)w.sessionStorage.setItem(state.DRAFT_KEY,sessionData);
 Object.assign(w,{__core:core,__state:state});
 const code=fs.readFileSync(path.join(root,'app.js'),'utf8')
 .replace(/^import .*from '.\/core.js';/m,'const {MAX_FILE_BYTES,MAX_INGREDIENTS,parseQuantity,rational,mixed,scaledText,validateRecipe,importRecipe,exportRecipe,clone}=window.__core;')
 .replace(/^import .*from '.\/state.js';/m,'const {createStore}=window.__state;');
 w.eval(code+'\nwindow.__store=store;');
 const fire=(node,type)=>node.dispatchEvent(new w.Event(type,{bubbles:true,cancelable:true}));
 const click=id=>$(id).click();
 const type=(node,value)=>{node.value=value;fire(node,'input')};
 const submit=id=>fire($(id),'submit');
 const before=()=>{const e=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(e);return e.defaultPrevented};
 const importFile=async r=>{
  const text=core.exportRecipe(r);
  Object.defineProperty($('file'),'files',{configurable:true,value:[{size:Buffer.byteLength(text),text:async()=>text}]});
  fire($('file'),'change');await new Promise(resolve=>setImmediate(resolve));
  if($('apply-import').disabled)throw Error('Import preview failed: '+$('import-error').textContent);
  click('apply-import');
 };
 return {w,$,core,state,store:w.__store,click,type,submit,before,importFile,close:()=>w.close()};
}
const recipe=(nl='\n')=>({title:'Evening'+nl+'meal',basePortions:'1'+nl+'1/2',targetPortions:'2'+nl+'1/2',ingredients:[{quantity:'1'+nl+'1/2',unit:'heaped'+nl+'cups',name:'dry'+nl+'grains'},{quantity:'',unit:'',name:'salt'}]});
module.exports={boot,recipe};
