import { offlineFetch as fetch } from './offline.js';
import { fechaMovimiento } from './movimientos-vista.js';
export function prepararCategorias({panel,companyId,apiUrl,alGuardar}) {
 const $=s=>panel.querySelector(s),menu=$('[data-category-menu]'),toggle=$('[data-category-toggle]'),options=$('#category-options');
 $('[data-add-modify-inventory]').parentElement.after(menu);
 const dialog=$('#categoria-dialogo'),form=dialog.querySelector('form'),selector=$('#categoria-selector'),name=$('#categoria-nombre');
 const error=$('[data-category-error]'),info=$('[data-category-info]'),save=form.querySelector('[type="submit"]'),cancel=$('[data-category-cancel]');
 let mode='crear',categories=[],busy=false,version=0,creationResolve=null;
 const labels={crear:'Crear categoría',modificar:'Modificar categoría',eliminar:'Eliminar categoría'};
 const url=id=>{const u=new URL('/api/categories'+(id?'/'+id:''),apiUrl);u.searchParams.set('company_id',companyId);return u;};
 const closeMenu=()=>{options.hidden=true;toggle.setAttribute('aria-expanded','false');};
 toggle.onclick=()=>{options.hidden=!options.hidden;toggle.setAttribute('aria-expanded',String(!options.hidden));};
 if(!menu.dataset.bound){
  document.addEventListener('click',e=>{if(!menu.contains(e.target))closeMenu();});
  menu.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();toggle.focus();}});menu.dataset.bound='true';
 }
 function showError(message){error.textContent=message;error.hidden=false;}
 selector.onchange=()=>{
  const selected=categories.find(c=>String(c.id)===selector.value);error.hidden=true;
  name.value=selected?.name??'';name.disabled=mode==='eliminar'||!selected;save.disabled=!selected;
  info.textContent=selected?`Sigla: ${selected.abbreviation} · Creación: ${fechaMovimiento(selected.created_at)} · Última actualización: ${fechaMovimiento(selected.updated_at)}`:'';
  if(mode==='eliminar'&&selected)info.textContent+=' · Sus productos pasarán a Sin Clasificar.';
 };
 const finishCreation=value=>{if(creationResolve)creationResolve(value);creationResolve=null;};
 async function open(categoryMode,resolve=null){
  closeMenu();mode=categoryMode;creationResolve=resolve;const current=++version;
  form.reset();error.hidden=true;save.textContent=labels[mode];$('#categoria-titulo').textContent=labels[mode];
  $('[data-category-selector-wrap]').hidden=mode==='crear';selector.disabled=true;selector.required=mode!=='crear';
  $('[data-category-name-wrap]').hidden=mode==='eliminar';name.disabled=mode!=='crear';
  info.textContent=mode==='crear'?'La sigla y las fechas se generan automáticamente.':'';save.disabled=mode!=='crear';dialog.showModal();
  if(mode==='crear')return;
  selector.replaceChildren(new Option('Cargando categorías…',''));
  try{
   const response=await fetch(url(),{cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await response.json();
   if(!response.ok||!Array.isArray(data))throw new Error(data.error||'No se pudieron cargar las categorías.');
   if(current!==version||!dialog.open)return;
   categories=data.filter(c=>c.name!=='Sin Clasificar');
   selector.replaceChildren(new Option(categories.length?'Selecciona una categoría':'No hay categorías disponibles',''));
   categories.forEach(c=>selector.add(new Option(`${c.name} (${c.abbreviation})`,String(c.id))));selector.disabled=!categories.length;
  }catch(err){if(current===version&&dialog.open)showError(err.message);}
 }
 for(const button of menu.querySelectorAll('[data-category-action]')) button.onclick=()=>open(button.dataset.categoryAction);
 cancel.onclick=()=>{version++;dialog.close();finishCreation(null);};dialog.oncancel=e=>{if(busy)e.preventDefault();else{version++;finishCreation(null);}};
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||!form.reportValidity())return;error.hidden=true;
  const id=mode==='crear'?null:selector.value;
  if(mode!=='crear'&&!categories.some(c=>String(c.id)===id))return;
  if(mode==='eliminar'&&!window.confirm('¿Eliminar esta categoría? Sus productos pasarán a Sin Clasificar.'))return;
  busy=true;save.disabled=cancel.disabled=selector.disabled=name.disabled=true;
  try{
   const response=await fetch(url(id),{method:mode==='crear'?'POST':mode==='modificar'?'PUT':'DELETE',headers:{'Content-Type':'application/json'},body:mode==='eliminar'?undefined:JSON.stringify({name:name.value.trim()})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo guardar la categoría.');
   const completedMode=mode,createdName=data.name??name.value.trim();
   dialog.close();await alGuardar();
   if(completedMode==='crear')finishCreation(createdName);
  }catch(err){showError(err.message);}
  finally{busy=false;save.disabled=cancel.disabled=false;selector.disabled=mode==='crear';name.disabled=mode==='eliminar';}
 };
 return {crear:()=>new Promise(resolve=>open('crear',resolve))};
}
