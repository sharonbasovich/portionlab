// Exact arithmetic: no binary floating-point arithmetic enters recipe quantities.
// Every schema-valid pretty JSON export fits below this UTF-8 ceiling.
// See docs/BACKUP_SIZE.md for the conservative bound and regression contract.
export const MAX_FILE_BYTES = 150_000;
export const MAX_INGREDIENTS = 80;
const MAX_COMPONENT = 999_999_999_999n;
const glyphs = { '¼':'1/4','½':'1/2','¾':'3/4','⅐':'1/7','⅑':'1/9','⅒':'1/10','⅓':'1/3','⅔':'2/3','⅕':'1/5','⅖':'2/5','⅗':'3/5','⅘':'4/5','⅙':'1/6','⅚':'5/6','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8' };
const gcd = (a,b) => b ? gcd(b,a%b) : a;
export function rational(n,d=1n) {
  if(typeof n!=='bigint'||typeof d!=='bigint')throw new Error('Rational components must be integers represented as BigInt.');
  if (d <= 0n || n < 0n) throw new Error('Use a non-negative quantity and a denominator greater than zero.');
  const g = gcd(n,d); return {n:n/g,d:d/g};
}
function checked(value) {
  if(!value || typeof value.n!=='bigint' || typeof value.d!=='bigint')throw new Error('Use a rational with BigInt numerator and denominator.');
  return rational(value.n,value.d);
}
export function parseQuantity(raw, {positive=false}={}) {
  if (typeof raw !== 'string' || raw.length > 48) throw new Error('Use up to 48 characters for a quantity.');
  let s = raw.trim();
  // Expand only a complete glyph quantity, never a substring. Otherwise a typo
  // such as ½1 could silently become 1/21 instead of being rejected.
  const glyph = /^(?:(\d{1,12})\s*)?([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/.exec(s);
  if (glyph) s = `${glyph[1] ? `${glyph[1]} ` : ''}${glyphs[glyph[2]]}`;
  let n,d;
  const mixed = /^(\d{1,12})\s+(\d{1,12})\/(\d{1,12})$/.exec(s);
  const frac = /^(\d{1,12})\/(\d{1,12})$/.exec(s);
  const dec = /^(\d{1,12})?(?:\.(\d{1,6}))?$/.exec(s);
  if (mixed) {
    const [,w,a,b]=mixed; d=BigInt(b); const part=BigInt(a);
    if (part >= d) throw new Error('The fraction in a mixed number must be less than one.');
    n=BigInt(w)*d+part;
    if (BigInt(w)>MAX_COMPONENT || part>MAX_COMPONENT || d>MAX_COMPONENT) throw new Error('Quantity is too large.');
  } else if (frac) { n=BigInt(frac[1]); d=BigInt(frac[2]); }
  else if (dec && (dec[1] || dec[2])) { d=10n**BigInt((dec[2]||'').length); n=BigInt(dec[1]||0)*d+BigInt(dec[2]||0); }
  else throw new Error('Use a number, fraction, or mixed number, such as 0.5, 1/3, or 1 1/2 (up to 6 decimal places).');
  const value=rational(n,d);
  if (value.n > MAX_COMPONENT*value.d || value.d > MAX_COMPONENT) throw new Error('Quantity is too large. Use a value below 1 trillion.');
  if (positive && value.n===0n) throw new Error('Portions must be greater than zero.');
  return value;
}
export function multiply(a,b) { a=checked(a);b=checked(b);return rational(a.n*b.n,a.d*b.d); }
export function scale(quantity,base,target) {
  const b=parseQuantity(base,{positive:true}), t=parseQuantity(target,{positive:true});
  return multiply(parseQuantity(quantity),rational(t.n*b.d,t.d*b.n));
}
export function mixed(value) {
  value=checked(value);
  const whole=value.n/value.d, part=value.n%value.d;
  return part ? `${whole ? `${whole} `:''}${part}/${value.d}` : `${whole}`;
}
export function decimalExact(value) {
  value=checked(value);
  let d=value.d, twos=0, fives=0;
  while (d%2n===0n) {d/=2n; twos++;}
  while (d%5n===0n) {d/=5n; fives++;}
  const places=Math.max(twos,fives);
  if (d!==1n || places>6) return null;
  if (!places) return `${value.n}`;
  const digits=(value.n*(10n**BigInt(places))/value.d).toString().padStart(places+1,'0');
  return `${digits.slice(0,-places)}.${digits.slice(-places)}`.replace(/0+$/,'').replace(/\.$/,'');
}
export function scaledText(raw,base,target) {
  if (!raw.trim()) return 'As written';
  const v=scale(raw,base,target);
  // Decimal inputs stay decimal when an exact short decimal exists.
  return raw.includes('.') ? (decimalExact(v) ?? mixed(v)) : mixed(v);
}
function keys(obj,expected,label) {
  if (!obj || typeof obj!=='object' || Array.isArray(obj) || Object.keys(obj).sort().join('|')!==[...expected].sort().join('|')) throw new Error(`${label} has an unsupported structure.`);
}
function textField(value,max,label,required=false) {
  if (typeof value!=='string' || value.length>max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${label} must be ${required?'non-empty text':'text'} of at most ${max} characters.`);
  return value;
}
export function validateRecipe(data) {
  keys(data,['title','basePortions','targetPortions','ingredients'],'Recipe');
  const title=textField(data.title,100,'Recipe title',true);
  const basePortions=textField(data.basePortions,48,'Original portions',true), targetPortions=textField(data.targetPortions,48,'Target portions',true);
  parseQuantity(basePortions,{positive:true}); parseQuantity(targetPortions,{positive:true});
  if (!Array.isArray(data.ingredients)||data.ingredients.length>MAX_INGREDIENTS) throw new Error(`Use at most ${MAX_INGREDIENTS} ingredients.`);
  // Array.from visits holes: a sparse array is invalid, never an omitted row.
  const ingredients=Array.from(data.ingredients,(row,i)=>{
    keys(row,['quantity','unit','name'],`Ingredient ${i+1}`);
    const quantity=textField(row.quantity,48,`Quantity ${i+1}`), unit=textField(row.unit,40,`Unit ${i+1}`), name=textField(row.name,160,`Ingredient ${i+1}`,true);
    if (quantity.trim()) parseQuantity(quantity);
    return {quantity,unit,name};
  });
  return {title,basePortions,targetPortions,ingredients};
}
export function exportRecipe(recipe) { return JSON.stringify({format:'portionlab',version:1,recipe:validateRecipe(recipe)},null,2)+'\n'; }
export function importRecipe(source) {
  if (typeof source!=='string' || new TextEncoder().encode(source).length>MAX_FILE_BYTES) throw new Error(`Choose a PortionLab JSON file of at most ${MAX_FILE_BYTES.toLocaleString('en-US')} UTF-8 bytes.`);
  let data; try {data=JSON.parse(source);} catch {throw new Error('This is not valid JSON. Choose a file downloaded from PortionLab.');}
  keys(data,['format','version','recipe'],'File');
  if (data.format!=='portionlab' || data.version!==1) throw new Error('This file is not a supported PortionLab version 1 recipe.');
  return validateRecipe(data.recipe);
}
export const clone = value => JSON.parse(JSON.stringify(value));
export const sample = {
  title:'Lemon & pea couscous',basePortions:'4',targetPortions:'6',ingredients:[
    {quantity:'1 1/2',unit:'cups',name:'dry couscous'},
    {quantity:'1 1/3',unit:'cups',name:'green peas'},
    {quantity:'2',unit:'tbsp',name:'olive oil'},
    {quantity:'1/4',unit:'cup',name:'lemon juice'},
    {quantity:'0.5',unit:'tsp',name:'lemon zest'},
    {quantity:'',unit:'',name:'chopped parsley, as preferred'}
  ]
};
