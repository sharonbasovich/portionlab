import {clone,validateRecipe,sample,exportRecipe,importRecipe} from './core.js';
export const RECIPE_KEY='portionlab.recipe.v1', DRAFT_KEY='portionlab.draft.v1';
function safeDraft(data) {
  if(!data || typeof data.baseSnapshot!=='string')throw new Error('Invalid draft');
  const opening=validateRecipe(data.opening),r=data.recipe;
  importRecipe(data.baseSnapshot);
  if(!r || !Array.isArray(r.ingredients)||r.ingredients.length>80)throw new Error('Invalid draft');
  for(const [key,max] of [['title',100],['basePortions',48],['targetPortions',48]])if(typeof r[key]!=='string'||r[key].length>max)throw new Error('Invalid draft');
  const ingredients=Array.from(r.ingredients,row=>{
    if(!row)throw new Error('Invalid draft');
    for(const [key,max] of [['quantity',48],['unit',40],['name',160]])if(typeof row[key]!=='string'||row[key].length>max)throw new Error('Invalid draft');
    return {quantity:row.quantity,unit:row.unit,name:row.name};
  });
  return {opening,baseSnapshot:data.baseSnapshot,recipe:{title:r.title,basePortions:r.basePortions,targetPortions:r.targetPortions,ingredients}};
}
// Storage is injected so failure and interrupted-session behavior can be tested.
export function createStore(persistent,session) {
  let recipe=clone(sample),previous=null,draft=null,expected=null,storageError='',conflict=false;
  try { expected=persistent.getItem(RECIPE_KEY); if(expected) recipe=importRecipe(expected); }
  catch {storageError='Saved recipe could not be read. The sample is shown; download your changes before leaving.';}
  try { const raw=session.getItem(DRAFT_KEY); if(raw) draft=safeDraft(JSON.parse(raw)); }
  catch {storageError=storageError||'Draft storage is unavailable. Keep this tab open or download your recipe.';}
  // Track durability separately from Undo. Undo can leave an earlier unsaved
  // recipe active after multiple failed writes. The initial recipe is also
  // the value a reload recovers when there is no readable saved recipe.
  let savedRecipe=exportRecipe(recipe);
  function persist() {
    try {
      const current=persistent.getItem(RECIPE_KEY);
      if(current!==expected) {conflict=true;return false;}
      const next=exportRecipe(recipe);persistent.setItem(RECIPE_KEY,next);expected=next;savedRecipe=next;return true;
    } catch {storageError='Browser storage is unavailable. Download JSON to keep your recipe.';return true;}
  }
  function saveDraft() {
    try { if(draft) session.setItem(DRAFT_KEY,JSON.stringify(draft)); else session.removeItem(DRAFT_KEY); }
    catch {storageError='Draft storage is unavailable. Keep this tab open until you apply or download changes.';}
  }
  return {
    get recipe(){return clone(recipe);},get previous(){return previous&&clone(previous);},get draft(){return draft&&clone(draft);},
    get warning(){return storageError;},get conflict(){return conflict;},
    get recipeUnsaved(){return exportRecipe(recipe)!==savedRecipe;},
    checkExternal(){try {if(persistent.getItem(RECIPE_KEY)!==expected) conflict=true;}catch {} return conflict;},
    begin(){if(!draft) {draft={recipe:clone(recipe),opening:clone(recipe),baseSnapshot:exportRecipe(recipe)};saveDraft();}return clone(draft.recipe);},
    edit(value){if(!draft) throw new Error('Open the recipe editor first.');draft.recipe=clone(value);saveDraft();},
    reset(){if(draft){draft.recipe=clone(draft.opening);saveDraft();}return draft&&clone(draft.recipe);},
    discard(){draft=null;saveDraft();},
    commit(value,{fromDraft=false,replaceStaleDraft=false}={}) {
      const next=validateRecipe(value);
      if(conflict || this.checkExternal()) throw new Error('Another tab changed the saved recipe. Download your copy, then reload to use the saved version.');
      if(fromDraft && draft && !replaceStaleDraft && draft.baseSnapshot!==exportRecipe(recipe)) throw new Error('The recipe changed after this draft opened. Review the current recipe before replacing it with this draft.');
      const old=recipe;recipe=next;
      if(!persist()){recipe=old;throw new Error('Another tab changed the saved recipe. Your current recipe and draft are preserved.');}
      // Repeating an applied value must not consume the one useful Undo step.
      // Still persist above: an unchanged commit may recover a failed save.
      if(exportRecipe(old)!==exportRecipe(recipe))previous=old;
      if(fromDraft)this.discard();return clone(recipe);
    },
    undo(){if(!previous)return; const old=clone(previous);this.commit(old);previous=null;},
    draftDirty(){return !!draft && JSON.stringify(draft.recipe)!==JSON.stringify(draft.opening);}
  };
}
