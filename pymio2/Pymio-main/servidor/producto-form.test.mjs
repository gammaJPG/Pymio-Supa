import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Formulario: lista por empresa, selección, edición, PUT y regreso a alta', async () => {
  const source = await readFile(new URL('../producto-form.js', import.meta.url), 'utf8');
  const campos = ['name', 'sku', 'category', 'qty', 'cost', 'price', 'crit_qty', 'low_qty', 'created_at', 'updated_at']
    .map(name => ({ name, value: '', disabled: false }));
  const category=campos.find(c=>c.name==='category');
  category.options=[];category.replaceChildren=function(...options){this.options=options;this.value='';};category.add=function(option){this.options.push(option);};
  const selector = { value: '', options: [], replaceChildren(...options) { this.options = options; this.value = ''; }, add(option) { this.options.push(option); } };
  const guardar = {}, cancelar = {}, descripcion = {}, selectorWrap = {}, error = {}, titulo = {};
  const camposWrap = {};
  const previewImage = {removeAttribute(){}, src:''};
  const imagePreview = {hidden:true,querySelector:()=>previewImage};
  const imageInput = {files:[],value:'',disabled:false};
  const imageField = {};
  const imageStatus = {};
  const form = {
    elements: Object.fromEntries(campos.map(c => [c.name, c])),
    querySelector: s => ({ '.producto-campos': camposWrap, '#producto-selector': selector, '#producto-image': imageInput, '[data-image-field]': imageField, '[data-image-preview]': imagePreview, '[data-image-status]': imageStatus, '[type="submit"]': guardar, '[data-cancelar]': cancelar, 'label[for="producto-qty"]': {}, '[data-updated-field]': {}, '[data-sku-field]': {}, '[data-selector]': selectorWrap, '[data-descripcion]': descripcion }[s]),
    querySelectorAll: () => campos,
    reportValidity: () => true,
    reset() { campos.forEach(c => { c.value = ''; }); selector.value = ''; }
  };
  const dialogo = { open: false, querySelector: s => ({ form, '.producto-error': error, h2: titulo }[s]), showModal() { this.open = true; }, close() { this.open = false; } };
  const agregar = {}, modificar = {}, borrar = {}, menu = {}, boton = { setAttribute() {} };
  const panel = { querySelector: s => ({ '#producto-dialogo': dialogo, '[data-accion="agregar"]': agregar, '[data-accion="modificar"]': modificar, '[data-accion="borrar"]': borrar, '#opciones-inventario': menu, '[data-add-modify-inventory]': boton }[s]) };
  const producto = { id: '81', company_id: '2', name: 'Producto original', sku: 'SKU-81', category: 'Categoría', qty: 5, cost: 100, price: 200, crit_qty: 2, low_qty: 6, created_at: '2026-09-09T12:00:35.123Z', updated_at: '2026-09-09T13:00:45.456Z' };
  const llamadas = [];
  let recargas = 0;
  let confirmar = false;
  const context = vm.createContext({
    URL, Date, AbortSignal, window: { confirm: () => confirmar },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    FormData: class { constructor() { return campos.map(c => [c.name, String(c.value)]); } },
    fetch: async (url, options = {}) => {
      llamadas.push({ url, options });
      if(url.pathname==='/api/categories')return {ok:true,json:async()=>[{name:'Sin Clasificar'},{name:'Categoría'}]};
      return { ok: true, json: async () => options.method ? { id: '81' } : [producto, { ...producto, id: '99', company_id: '3' }] };
    }
  });
  // El formulario usa offlineFetch; esta prueba aporta su doble mediante context.fetch.
  vm.runInContext(source.replace("import { offlineFetch as fetch } from './offline.js';", '').replace('export function', 'function'), context);
  context.prepararFormularioProducto({ panel, companyId: 2, apiUrl: 'http://localhost:3001', alGuardar: async () => { recargas++; } });
  await modificar.onclick();
  assert.equal(dialogo.open, true);
  assert.equal(llamadas[0].url.searchParams.get('company_id'), '2');
  assert.equal(selector.options.length, 2); // Marcador + producto de la empresa 2.
  assert.equal(guardar.disabled, true);
  selector.value = '81';
  selector.onchange();
  assert.equal(form.elements.name.value, producto.name);
  assert.equal(form.elements.low_qty.value, 6);
  assert.ok(campos.every(c => !c.disabled));
  form.elements.name.value = 'Nombre editado';
  form.elements.qty.value = '8';
  await form.onsubmit({ preventDefault() {} });
  const guardado = llamadas.at(-1);
  assert.equal(guardado.options.method, 'PUT');
  assert.equal(guardado.url.pathname, '/api/products/81');
  assert.equal(guardado.url.searchParams.get('company_id'), '2');
  const datos = JSON.parse(guardado.options.body);
  assert.equal(datos.name, 'Nombre editado');
  assert.equal(datos.qty, 8);
  assert.equal(datos.created_at, producto.created_at);
  assert.equal(recargas, 1);
  assert.equal(dialogo.open, false);
  await agregar.onclick();
  assert.equal(selectorWrap.hidden, true);
  assert.equal(form.elements.name.value, '');
  assert.equal(guardar.disabled, false);
  dialogo.close();
  await borrar.onclick();
  assert.equal(camposWrap.hidden, true);
  assert.equal(guardar.disabled, true);
  selector.value = '81';
  selector.onchange();
  assert.ok(campos.every(c => c.disabled));
  const antes = llamadas.length;
  await form.onsubmit({ preventDefault() {} });
  assert.equal(llamadas.length, antes); // Cancelar la confirmación no borra.
  confirmar = true;
  await form.onsubmit({ preventDefault() {} });
  assert.equal(llamadas.at(-1).options.method, 'DELETE');
  assert.equal(llamadas.at(-1).url.pathname, '/api/products/81');
  assert.equal(llamadas.at(-1).url.searchParams.get('company_id'), '2');
  assert.equal(recargas, 2);
  assert.equal(dialogo.open, false);
});
