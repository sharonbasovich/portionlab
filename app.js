import {MAX_FILE_BYTES,MAX_INGREDIENTS,parseQuantity,rational,mixed,scaledText,validateRecipe,importRecipe,exportRecipe,clone} from './core.js';
import {createStore} from './state.js';
const $=id=>document.getElementById(id);
// Accessing storage itself may throw in privacy-restricted browser contexts.
const unavailable={getItem(){throw new Error('Storage unavailable');},setItem(){throw new Error('Storage unavailable');},removeItem(){throw new Error('Storage unavailable');}};
function storage(name){try{return window[name];}catch{return unavailable;}}
const store=createStore(storage('localStorage'),storage('sessionStorage'));
let targetDirty=false,editorDraft=null,removed=null,pendingImport=null,decision=null,lastMessage='',importGeneration=0;
function announce(message){$('status').textContent=message;lastMessage=message;}
function error(id,message){$(id).textContent=message;$(id).hidden=!message;}
function setText(node,text){node.textContent=text;return node;}
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
// Single-line inputs strip line breaks. Keep the original string while its
// space-separated display is unchanged, including edits reverted by the user.
const inputBindings=new WeakMap();
function bindInput(input,raw){
  const display=raw.replace(/\r\n?|\n/g,' ');
  input.value=display;inputBindings.set(input,{raw,display:input.value});
}
function readInput(input){
  const binding=inputBindings.get(input);
  return binding && input.value===binding.display?binding.raw:input.value;
}
function pendingTarget(){
  $('target-pending').hidden=!targetDirty;
  $('target-pending').textContent=`Not applied. The sheet still uses ${store.recipe.targetPortions} portions.`;
}
function render(){
  const recipe=store.recipe;
  $('recipe-title').textContent=recipe.title;
  document.title=`${recipe.title} · PortionLab`;
  $('base-value').textContent=recipe.basePortions;
  if(targetDirty && readInput($('target'))===recipe.targetPortions)targetDirty=false;
  if(!targetDirty)bindInput($('target'),recipe.targetPortions);
  const b=parseQuantity(recipe.basePortions,{positive:true}),t=parseQuantity(recipe.targetPortions,{positive:true});
  $('factor').textContent=`${mixed(rational(t.n*b.d,t.d*b.n))}× the original`;
  $('plate-caption').textContent=`${recipe.basePortions} portions become ${recipe.targetPortions}.`;
  const ratio=Number(t.n*b.d)/Number(t.d*b.n),max=window.innerWidth<=680?150:205;
  const a=ratio>1?max/Math.sqrt(ratio):max,c=ratio>1?max:max*Math.sqrt(ratio);
  $('plate-original').style.setProperty('--size',`${Math.max(36,a)}px`);
  $('plate-target').style.setProperty('--size',`${Math.max(36,c)}px`);
  const bounded=Math.min(a,c)<36;
  $('plate-caption').setAttribute('aria-label',`${recipe.basePortions} original portions, ${recipe.targetPortions} target portions.${bounded?' Diagram size is bounded for visibility.':''}`);
  $('base-heading').textContent=`${recipe.basePortions} portions`;
  $('target-heading').textContent=`${recipe.targetPortions} portions`;
  $('sheet-description').textContent=`${recipe.basePortions} original portions, scaled to ${recipe.targetPortions}. Exact amounts, ready to use.`;
  const rows=recipe.ingredients.map(row=>{
    const tr=el('tr'),name=el('td','',row.name),original=el('td','quantity'),scaled=el('td','quantity scaled');
    if(row.quantity.trim()){
      original.append(document.createTextNode(row.quantity));scaled.append(document.createTextNode(scaledText(row.quantity,recipe.basePortions,recipe.targetPortions)));
      if(row.unit){original.append(el('small','',row.unit));scaled.append(el('small','',row.unit));}
    }else{
      original.append(el('span','unmeasured','Unmeasured'));scaled.append(el('span','unmeasured','As written'));
      if(row.unit){original.append(el('small','',row.unit));scaled.append(el('small','',row.unit));}
    }
    tr.append(name,original,scaled);return tr;
  });
  $('ingredient-rows').replaceChildren(...rows);$('empty').hidden=rows.length>0;
  $('resume').hidden=!store.draft || $('editor').open;
  $('undo').hidden=!store.previous;
  $('change-note').textContent=store.previous?lastMessage:'';
  const warning=store.conflict?'Another tab changed the saved recipe. Your copy is preserved here. Download it before reloading; changes cannot be applied in this tab.':store.warning;
  $('warning').textContent=warning;$('warning').hidden=!warning;
  $('storage-status').textContent=store.warning?'Storage needs attention. Download JSON to keep a portable copy.':'Local to this browser. Download JSON for a portable copy.';
  pendingTarget();
}
function collectDraft(){
  editorDraft.title=readInput($('draft-title'));editorDraft.basePortions=readInput($('draft-base'));
  editorDraft.ingredients=[...$('draft-rows').children].map(row=>({quantity:readInput(row.querySelector('[data-field=quantity]')),unit:readInput(row.querySelector('[data-field=unit]')),name:readInput(row.querySelector('[data-field=name]'))}));
  store.edit(editorDraft);
}
function renderDraft(){
  bindInput($('draft-title'),editorDraft.title);bindInput($('draft-base'),editorDraft.basePortions);
  const rows=editorDraft.ingredients.map((row,i)=>{
    const group=el('div','draft-row');group.setAttribute('role','group');group.setAttribute('aria-label',`Ingredient ${i+1}`);
    for(const [key,label,max] of [['quantity','Quantity',48],['unit','Unit',40],['name','Ingredient',160]]){
      const wrap=el('label'),input=el('input');wrap.append(el('span','',label));
      bindInput(input,row[key]);input.dataset.field=key;input.maxLength=max;input.autocomplete='off';input.setAttribute('aria-label',`${label} ${i+1}`);
      if(key==='quantity')input.placeholder='e.g. 1 1/2';if(key==='unit')input.placeholder='e.g. cups';if(key==='name')input.required=true;
      wrap.append(input);group.append(wrap);
    }
    const remove=el('button','remove-row','×');remove.type='button';remove.dataset.remove=String(i);remove.setAttribute('aria-label',`Remove ingredient ${i+1}`);group.append(remove);return group;
  });
  $('draft-rows').replaceChildren(...rows);$('row-count').textContent=`${rows.length} of ${MAX_INGREDIENTS} ingredients`;
  $('add-row').disabled=rows.length>=MAX_INGREDIENTS;$('undo-remove').hidden=!removed;
}
function openEditor(){
  editorDraft=store.begin();removed=null;error('editor-error','');hideDecision();renderDraft();$('editor').showModal();$('resume').hidden=true;$('draft-title').focus();
}
function hideDecision(){$('draft-decision').hidden=true;decision=null;}
function requestDecision(action){
  collectDraft();
  if(action==='close'&&!store.draftDirty()){closeEditor(false);return;}
  decision=action;$('draft-decision').hidden=false;
  $('decision-text').textContent=action==='reset'?'Reset every draft field to the values from when you opened this editor?':'Discard these unfinished edits? Your applied recipe will stay as it is.';
  $('confirm-decision').textContent=action==='reset'?'Reset draft':'Discard draft';$('keep-editing').focus();
}
function closeEditor(discard){if(discard||!store.draftDirty())store.discard();$('editor').close();editorDraft=null;removed=null;hideDecision();render();$('edit').focus();}
function validateEditor(){
  for(const input of $('recipe-form').querySelectorAll('input'))input.removeAttribute('aria-invalid');
  let invalid;
  try {
    if(!editorDraft.title.trim())invalid=$('draft-title');
    if(editorDraft.title.length>100)invalid=$('draft-title');
    if(invalid)throw new Error('Give the recipe a title (up to 100 characters).');
    try{parseQuantity(editorDraft.basePortions,{positive:true});}catch(e){invalid=$('draft-base');throw e;}
    for(let i=0;i<editorDraft.ingredients.length;i++){
      const row=editorDraft.ingredients[i],group=$('draft-rows').children[i];
      if(!row.name.trim()){invalid=group.querySelector('[data-field=name]');throw new Error(`Ingredient ${i+1} needs a name. Fill it in or remove the row.`);}
      if(row.quantity.trim())try{parseQuantity(row.quantity);}catch(e){invalid=group.querySelector('[data-field=quantity]');throw new Error(`Ingredient ${i+1}: ${e.message}`);}
    }
    return validateRecipe(editorDraft);
  }catch(e){if(invalid){invalid.setAttribute('aria-invalid','true');invalid.focus();}throw e;}
}
$('scale-form').addEventListener('submit',event=>{
  event.preventDefault();error('target-error','');$('target').removeAttribute('aria-invalid');
  try{
    if(store.draft)throw new Error('Resume and apply or discard your unfinished recipe draft before changing portions.');
    const target=readInput($('target'));parseQuantity(target,{positive:true});
    store.commit({...store.recipe,targetPortions:target});targetDirty=false;announce('Portions updated.');render();
  }catch(e){error('target-error',e.message);$('target').setAttribute('aria-invalid','true');$('target').focus();render();}
});
$('target').addEventListener('input',()=>{targetDirty=readInput($('target'))!==store.recipe.targetPortions;error('target-error','');$('target').removeAttribute('aria-invalid');pendingTarget();});
$('edit').addEventListener('click',openEditor);$('add-first').addEventListener('click',openEditor);$('resume-draft').addEventListener('click',openEditor);
$('recipe-form').addEventListener('input',()=>{collectDraft();hideDecision();error('editor-error','');});
$('recipe-form').addEventListener('submit',event=>{
  event.preventDefault();collectDraft();hideDecision();
  try{const next=validateEditor();store.commit(next,{fromDraft:true});announce('Recipe applied.');$('editor').close();editorDraft=null;render();$('edit').focus();}
  catch(e){
    error('editor-error',e.message);render();
    if(e.message.startsWith('The recipe changed after')){
      decision='replace-stale';$('draft-decision').hidden=false;
      $('decision-text').textContent=`Your draft started from an older recipe. Applying it will replace “${store.recipe.title}” (${store.recipe.basePortions} original portions, ${store.recipe.targetPortions} target portions) with this draft. Undo will be available.`;
      $('confirm-decision').textContent='Replace with draft';$('keep-editing').focus();
    }
  }
});
for(const id of ['close-editor','cancel-editor'])$(id).addEventListener('click',()=>requestDecision('close'));
$('editor').addEventListener('cancel',event=>{event.preventDefault();requestDecision('close');});
$('reset-draft').addEventListener('click',()=>requestDecision('reset'));
$('keep-editing').addEventListener('click',()=>{hideDecision();$('draft-title').focus();});
$('confirm-decision').addEventListener('click',()=>{
  if(decision==='replace-stale'){
    try{collectDraft();const next=validateEditor();store.commit(next,{fromDraft:true,replaceStaleDraft:true});announce('Recipe replaced with recovered draft.');$('editor').close();editorDraft=null;hideDecision();render();$('edit').focus();}
    catch(e){error('editor-error',e.message);hideDecision();render();}
  }
  else if(decision==='reset'){editorDraft=store.reset();removed=null;hideDecision();renderDraft();error('editor-error','');$('draft-title').focus();announce('Draft reset to its opening values.');}
  else closeEditor(true);
});
$('add-row').addEventListener('click',()=>{collectDraft();if(editorDraft.ingredients.length>=MAX_INGREDIENTS)return;editorDraft.ingredients.push({quantity:'',unit:'',name:''});store.edit(editorDraft);renderDraft();hideDecision();$('draft-rows').lastElementChild.querySelector('input').focus();});
$('draft-rows').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove]');if(!button)return;collectDraft();const index=Number(button.dataset.remove);
  removed={index,row:editorDraft.ingredients[index]};editorDraft.ingredients.splice(index,1);store.edit(editorDraft);renderDraft();hideDecision();$('undo-remove').focus();announce('Ingredient removed from draft. Undo removal is available.');
});
$('undo-remove').addEventListener('click',()=>{if(!removed)return;collectDraft();if(editorDraft.ingredients.length>=MAX_INGREDIENTS){error('editor-error','Remove another row before restoring this ingredient.');return;}editorDraft.ingredients.splice(removed.index,0,removed.row);const index=removed.index;removed=null;store.edit(editorDraft);renderDraft();$('draft-rows').children[index].querySelector('input').focus();});
$('undo').addEventListener('click',()=>{try{if(store.draft)throw new Error('Resume and apply or discard the unfinished draft before undoing a recipe change.');store.undo();announce('Last recipe change undone.');render();}catch(e){announce(e.message);error('warning',e.message);}});
function download(recipe){
  const data=exportRecipe(recipe),blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');
  a.href=url;a.download='portionlab-recipe.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('JSON download started for the applied recipe.');
}
$('download').addEventListener('click',()=>download(store.recipe));
$('print').addEventListener('click',()=>window.print());
$('load').addEventListener('click',()=>{
  if(store.draft){announce('Resume and apply or discard your unfinished recipe draft before loading a file.');$('resume').hidden=false;$('resume-draft').focus();return;}
  $('file').value='';$('file').click();
});
$('file').addEventListener('change',async()=>{
  const file=$('file').files[0];if(!file)return;
  const generation=++importGeneration;
  pendingImport=null;error('import-error','');$('apply-import').disabled=true;$('import-preview').replaceChildren();$('import-dialog').showModal();
  try{
    if(file.size>MAX_FILE_BYTES)throw new Error('Choose a PortionLab JSON file smaller than 100 KB.');
    const imported=importRecipe(await file.text());
    // A cancelled/closed preview cannot be resurrected by an asynchronous file read.
    if(!$('import-dialog').open || generation!==importGeneration)return;
    pendingImport=imported;
    $('import-preview').append(el('h3','',imported.title),el('p','',`${imported.ingredients.length} ingredients. ${imported.basePortions} original portions, ${imported.targetPortions} target portions.`),el('p','',`This replaces “${store.recipe.title}”. You can undo the replacement until your next recipe change.`));
    $('apply-import').disabled=false;
  }catch(e){if($('import-dialog').open && generation===importGeneration)error('import-error',e.message);}
});
function closeImport(){importGeneration++;pendingImport=null;$('import-dialog').close();$('load').focus();}
for(const id of ['close-import','cancel-import'])$(id).addEventListener('click',closeImport);
$('import-dialog').addEventListener('cancel',event=>{event.preventDefault();closeImport();});
$('apply-import').addEventListener('click',()=>{if(!pendingImport)return;try{store.commit(pendingImport);announce('Recipe loaded.');closeImport();render();}catch(e){error('import-error',e.message);render();}});
// Keep keyboard navigation within an open dialog, including at browser-chrome
// boundaries where native dialog behavior differs between browser versions.
for(const dialog of [$('editor'),$('import-dialog')])dialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const controls=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(!first){event.preventDefault();return;}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
window.addEventListener('storage',()=>{if(store.checkExternal()){render();announce('Another tab changed the saved recipe. Your current copy and draft are preserved.');}});
window.addEventListener('resize',()=>render());
window.addEventListener('beforeunload',event=>{
  if(targetDirty || store.recipeUnsaved || (store.warning && store.draftDirty())){event.preventDefault();event.returnValue='';}
});
render();
