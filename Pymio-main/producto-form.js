import { offlineFetch as fetch } from './offline.js';
// La empresa llega desde iniciarInventario, después del login.
export function prepararFormularioProducto({ panel, companyId, apiUrl, alGuardar }) {
  let dialogo = panel.querySelector('#producto-dialogo');
  if (!dialogo) {
    dialogo = document.createElement('dialog');
    dialogo.id = 'producto-dialogo';
    dialogo.className = 'producto-dialogo';
    dialogo.setAttribute('aria-labelledby', 'producto-titulo');
    dialogo.innerHTML = `
      <form id="producto-form">
        <h2 id="producto-titulo">Crear Producto</h2>
        <p data-descripcion hidden></p>
        <div class="field" data-selector hidden><label for="producto-selector">Producto existente</label><select id="producto-selector"><option value="">Selecciona un producto</option></select></div>
        <div class="producto-campos">
          <div class="field"><label for="producto-name">Producto</label><input id="producto-name" name="name" required></div>
          <div class="field" data-sku-field><label for="producto-sku">SKU</label><input id="producto-sku" name="sku" maxlength="32" title="Letras mayúsculas y números, separados opcionalmente por guiones. Ejemplo: AND-0021" required></div>
          <div class="field"><label for="producto-category">Categoría</label><select id="producto-category" name="category" required></select></div>
          <div class="field"><label for="producto-qty">Cantidad</label><input id="producto-qty" name="qty" type="number" min="0" max="2147483647" step="1" value="0" required></div>
          <div class="field"><label for="producto-cost">Costo (CLP)</label><input id="producto-cost" name="cost" type="number" min="0" max="2147483647" step="1" required></div>
          <div class="field"><label for="producto-price">Precio (CLP)</label><input id="producto-price" name="price" type="number" min="0" max="2147483647" step="1" required></div>
          <div class="field"><label for="producto-crit">Stock crítico</label><input id="producto-crit" name="crit_qty" type="number" min="0" max="2147483646" step="1" required></div>
          <div class="field"><label for="producto-low">Stock bajo</label><input id="producto-low" name="low_qty" type="number" min="1" max="2147483647" step="1" required></div>
          <div class="field"><label for="producto-created">Creado</label><input id="producto-created" name="created_at" type="datetime-local" required></div>
          <div class="field" data-updated-field><label for="producto-updated">Actualizado</label><input id="producto-updated" name="updated_at" type="datetime-local" required></div>
        </div>
        <p class="producto-error" role="alert" hidden></p>
        <div class="producto-acciones">
          <button type="button" class="btn-secondary" data-cancelar>Cancelar</button>
          <button type="submit" class="btn-primary">Guardar producto</button>
        </div>
      </form>`;
    panel.appendChild(dialogo);
  }
  const form = dialogo.querySelector('form');
  const error = dialogo.querySelector('.producto-error');
  const guardar = form.querySelector('[type="submit"]');
  const cancelar = form.querySelector('[data-cancelar]');
  let guardando = false;
  let modo = 'agregar';
  let productos = [];
  let carga = 0;
  const selector = form.querySelector('#producto-selector');
  const campos = [...form.querySelectorAll('.producto-campos input, .producto-campos select')];
  const fechaLocal = valor => {
    const fecha = new Date(valor);
    return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const mostrarError = texto => { error.textContent = texto; error.hidden = false; };

  function abrir(tipo) {
    form.querySelector('label[for="producto-qty"]').textContent = tipo === 'agregar' ? 'Inventario Inicial' : 'Cantidad';
    carga++;
    modo = tipo;
    panel.querySelector('#opciones-inventario').hidden = true;
    panel.querySelector('[data-add-modify-inventory]').setAttribute('aria-expanded', 'false');
    form.reset();
    error.hidden = true;
    form.querySelector('[data-selector]').hidden = tipo === 'agregar';
    selector.required = tipo !== 'agregar';
    selector.disabled = tipo === 'agregar';
    campos.forEach(campo => { campo.disabled = tipo !== 'agregar'; });
    form.querySelector('[data-updated-field]').hidden = tipo === 'agregar';
    form.elements.updated_at.disabled = tipo !== 'modificar';
    form.elements.updated_at.required = tipo !== 'agregar';
    form.querySelector('[data-sku-field]').hidden = tipo === 'agregar';
    form.elements.sku.disabled = tipo === 'agregar' || tipo === 'borrar';
    form.elements.sku.required = tipo !== 'agregar';
    guardar.disabled = tipo !== 'agregar';
    form.querySelector('.producto-campos').hidden = tipo === 'borrar';
    guardar.textContent = tipo === 'borrar' ? 'Eliminar producto' : tipo === 'modificar' ? 'Guardar cambios' : 'Guardar producto';
    dialogo.querySelector('h2').textContent = tipo === 'borrar' ? 'Eliminar producto' : tipo === 'modificar' ? 'Modificar producto' : 'Crear Producto';
    form.querySelector('[data-descripcion]').hidden = tipo === 'agregar';
    form.querySelector('[data-descripcion]').textContent = tipo === 'borrar' ? 'Selecciona el producto que deseas eliminar definitivamente de la base de datos.' : tipo === 'modificar'
      ? 'Selecciona un producto de tu empresa y edita sus datos. La fecha de actualización se registra automáticamente al guardar.'
      : '';
    const ahora = new Date();
    const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    form.elements.created_at.value = local;
    form.elements.updated_at.value = local;
    dialogo.showModal();
  }
  async function cargarCategorias(solicitud) {
    const category = form.elements.category;
    guardar.disabled = true; category.disabled = true;
    category.replaceChildren(new Option('Cargando categorías…',''));
    const url = new URL('/api/categories',apiUrl); url.searchParams.set('company_id',companyId);
    const response = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) throw new Error('No se pudieron cargar las categorías.');
    if (solicitud !== carga || !dialogo.open) return;
    category.replaceChildren(new Option('Selecciona una categoría',''));
    data.forEach(c => category.add(new Option(c.name,c.name)));
    category.value = data.some(c=>c.name==='Sin Clasificar') ? 'Sin Clasificar' : '';
    category.disabled = modo !== 'agregar';
    if (modo === 'agregar') guardar.disabled = false;
  }
  panel.querySelector('[data-accion="agregar"]').onclick = async () => {
    abrir('agregar'); const solicitud = carga;
    try { await cargarCategorias(solicitud); }
    catch(err) { if (solicitud === carga && dialogo.open) mostrarError(err.message); }
  };
  async function abrirListado(tipo) {
    abrir(tipo);
    const solicitud = carga;
    selector.replaceChildren(new Option('Cargando productos…', ''));
    selector.disabled = true;
    try {
      if (tipo !== 'borrar') await cargarCategorias(solicitud);
      if (solicitud !== carga || !dialogo.open) return;
      const url = new URL('/api/products', apiUrl);
      url.searchParams.set('company_id', companyId);
      const respuesta = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!respuesta.ok) throw new Error('No se pudo obtener el listado de productos.');
      const datos = await respuesta.json();
      if (!Array.isArray(datos)) throw new Error('El listado recibido no es válido.');
      if (solicitud !== carga || !dialogo.open) return;
      productos = datos.filter(p => String(p.company_id) === String(companyId));
      selector.replaceChildren(new Option(productos.length ? 'Selecciona un producto' : 'No hay productos en esta empresa', ''));
      productos.forEach(p => selector.add(new Option(`${p.name} — ${p.sku}`, String(p.id))));
      selector.disabled = !productos.length;
    } catch (err) {
      if (solicitud === carga && dialogo.open) {
        selector.replaceChildren(new Option('Listado no disponible', ''));
        mostrarError(`${err.message} Cierra el formulario y vuelve a abrirlo para reintentar.`);
      }
    }
  };
  panel.querySelector('[data-accion="modificar"]').onclick = () => abrirListado('modificar');
  panel.querySelector('[data-accion="borrar"]').onclick = () => abrirListado('borrar');
  selector.onchange = () => {
    const producto = productos.find(p => String(p.id) === selector.value);
    error.hidden = true;
    campos.forEach(campo => {
      campo.disabled = !producto || modo === 'borrar';
      campo.value = !producto ? '' : ['created_at', 'updated_at'].includes(campo.name)
        ? fechaLocal(producto[campo.name]) : producto[campo.name];
    });
    guardar.disabled = !producto;
  };
  cancelar.onclick = () => dialogo.close();
  dialogo.oncancel = evento => { if (guardando) evento.preventDefault(); };
  form.onsubmit = async evento => {
    evento.preventDefault();
    if (guardando || !form.reportValidity()) return;
    const productoId = modo !== 'agregar' ? selector.value : null;
    if (modo !== 'agregar' && !productos.some(p => String(p.id) === productoId)) return;
    error.hidden = true;
    const seleccionado = productos.find(p => String(p.id) === productoId);
    if (modo === 'borrar' && !window.confirm(`¿Eliminar definitivamente "${seleccionado.name}" (${seleccionado.sku})? Esta acción no se puede deshacer.`)) return;
    const datos = Object.fromEntries(new FormData(form));
    if (modo !== 'borrar') {
    if (modo === 'agregar') delete datos.sku;
    datos.name = datos.name.trim();
    datos.category = datos.category.trim();
    for (const campo of ['qty', 'cost', 'price', 'crit_qty', 'low_qty']) datos[campo] = Number(datos[campo]);
    if (!datos.name || !datos.category) return mostrarError('Completa el producto y la categoría.');
    if (datos.low_qty <= datos.crit_qty) return mostrarError('El stock bajo debe ser mayor que el stock crítico.');
    const original = productos.find(p => String(p.id) === productoId);
    if (modo === 'agregar') datos.updated_at = datos.created_at;
    for (const campo of ['created_at', 'updated_at']) {
      datos[campo] = original && datos[campo] === fechaLocal(original[campo])
        ? original[campo] : new Date(datos[campo]).toISOString();
    }
    if (Date.parse(datos.updated_at) < Date.parse(datos.created_at)) return mostrarError('La fecha de actualización no puede ser anterior a la de creación.');
    }
    guardando = true;
    guardar.disabled = cancelar.disabled = true;
    selector.disabled = true;
    guardar.textContent = modo === 'borrar' ? 'Eliminando…' : 'Guardando…';
    try {
      const url = new URL(productoId ? `/api/products/${encodeURIComponent(productoId)}` : '/api/products', apiUrl);
      url.searchParams.set('company_id', companyId);
      const respuesta = await fetch(url, { method: modo === 'borrar' ? 'DELETE' : productoId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: modo === 'borrar' ? undefined : JSON.stringify(datos) });
      const resultado = await respuesta.json();
      if (!respuesta.ok) throw new Error(resultado.error || 'No se pudo guardar el producto.');
      dialogo.close();
      await alGuardar();
    } catch (err) {
      mostrarError(err instanceof TypeError ? 'No se pudo confirmar el guardado. Revisa la conexión y actualiza el inventario antes de reintentar.' : err.message);
    } finally {
      guardando = false;
      guardar.disabled = cancelar.disabled = false;
      selector.disabled = modo === 'agregar';
      guardar.textContent = modo === 'borrar' ? 'Eliminar producto' : modo === 'modificar' ? 'Guardar cambios' : 'Guardar producto';
    }
  };
}
