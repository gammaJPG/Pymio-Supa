import { offlineFetch as fetch } from './offline.js';
import { configureIntegerInput, parseFormattedInteger } from './number-format.js';
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);
const MAX_ORIGINAL_IMAGE = 10 * 1024 * 1024;
const MAX_PRODUCT_IMAGE = 250 * 1024;
const formatoEntero = new Intl.NumberFormat('es-CL', {maximumFractionDigits:0});
const formatoMoneda = new Intl.NumberFormat('es-CL', {style:'currency',currency:'CLP',maximumFractionDigits:0});

function descripcionProductoCreado(producto) {
  return `${producto.name}${producto.sku ? ` · ${producto.sku}` : ''} · Stock ${formatoEntero.format(producto.qty)} · Precio ${formatoMoneda.format(producto.price)}`;
}

function descripcionCambiosProducto(anterior, actual, fotoCambiada) {
  const campos = [
    ['name','Nombre',value=>String(value)],
    ['category','Categoría',value=>String(value)],
    ['qty','Stock',value=>formatoEntero.format(Number(value))],
    ['cost','Costo',value=>formatoMoneda.format(Number(value))],
    ['price','Precio',value=>formatoMoneda.format(Number(value))],
    ['low_qty','Umbral de stock bajo',value=>formatoEntero.format(Number(value))]
  ];
  const cambios = campos.flatMap(([campo,etiqueta,formatear]) => String(anterior?.[campo] ?? '') === String(actual?.[campo] ?? '')
    ? [] : [`${etiqueta}: ${formatear(anterior?.[campo] ?? 0)} → ${formatear(actual?.[campo] ?? 0)}`]);
  if (fotoCambiada) cambios.push('Foto actualizada');
  return cambios.length ? cambios.join(' · ') : 'Se guardó el producto sin cambios visibles.';
}

async function optimizarImagenProducto(file) {
  if (!IMAGE_TYPES.has(file.type)) throw new Error('Selecciona una imagen JPG, JPEG, PNG o WebP.');
  if (file.size > MAX_ORIGINAL_IMAGE) throw new Error('La imagen original no puede superar 10 MB.');
  let source;
  try { source = await createImageBitmap(file); }
  catch { throw new Error('No se pudo leer la imagen. Selecciona un archivo JPG, PNG o WebP válido.'); }
  const scale = Math.min(1, 800 / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  source.close?.();
  const encode = quality => new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
  let blob, quality = .8;
  for (const candidate of [.8,.75,.7,.65,.6,.55,.5]) {
    quality = candidate; blob = await encode(candidate);
    if (!blob) throw new Error('Este navegador no pudo convertir la imagen a WebP.');
    if (blob.size <= MAX_PRODUCT_IMAGE) break;
  }
  if (blob.size > MAX_PRODUCT_IMAGE) throw new Error('La imagen sigue superando 250 KB con la compresión máxima. Sube una imagen que pese menos.');
  return {blob,width,height,quality};
}
// La empresa llega desde iniciarInventario, después del login.
export function prepararFormularioProducto({ panel, companyId, apiUrl, alGuardar, crearCategoria }) {
  let dialogo = panel.querySelector('#producto-dialogo');
  if (!dialogo) {
    dialogo = document.createElement('dialog');
    dialogo.id = 'producto-dialogo';
    dialogo.className = 'producto-dialogo';
    dialogo.setAttribute('aria-labelledby', 'producto-titulo');
    dialogo.innerHTML = `
      <form id="producto-form">
        <h2 id="producto-titulo">Crear producto</h2>
        <p data-descripcion hidden></p>
        <div class="field" data-selector hidden><label for="producto-selector">Producto existente</label><select id="producto-selector"><option value="">Selecciona un producto</option></select></div>
        <div class="producto-campos">
          <div class="field"><label for="producto-name">Producto</label><input id="producto-name" name="name" required></div>
          <div class="field" data-sku-field><label for="producto-sku">SKU</label><input id="producto-sku" name="sku" maxlength="32" title="Letras mayúsculas y números, separados opcionalmente por guiones. Ejemplo: AND-0021" required></div>
          <div class="field"><label for="producto-category">Categoría</label><select id="producto-category" name="category" required></select></div>
          <div class="field"><label for="producto-qty">Cantidad</label><input id="producto-qty" name="qty" type="text" inputmode="numeric" value="0" required></div>
          <div class="field"><label for="producto-cost">Costo Unitario (CLP)</label><input id="producto-cost" name="cost" type="text" inputmode="numeric" required></div>
          <div class="field"><label for="producto-price">Precio Unitario (CLP)</label><input id="producto-price" name="price" type="text" inputmode="numeric" required></div>
          <div class="field"><label for="producto-low">Stock Bajo</label><input id="producto-low" name="low_qty" type="text" inputmode="numeric" required></div>
          <div class="field"><label for="producto-created">Creado</label><input id="producto-created" name="created_at" type="datetime-local" required></div>
          <div class="field" data-updated-field><label for="producto-updated">Actualizado</label><input id="producto-updated" name="updated_at" type="datetime-local" required></div>
        </div>
        <div class="field producto-imagen" data-image-field>
          <label for="producto-image">Foto del producto</label>
          <input id="producto-image" type="file" accept="image/jpeg,image/png,image/webp">
          <small>JPG, JPEG, PNG o WebP · máximo 10 MB · se guardará como WebP de hasta 800 × 800 px y 250 KB.</small>
          <div class="producto-imagen-preview" data-image-preview hidden><img alt="Vista previa de la foto del producto"><span data-image-status></span></div>
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
  const imageInput = form.querySelector('#producto-image');
  const imageField = form.querySelector('[data-image-field]');
  const imagePreview = form.querySelector('[data-image-preview]');
  const imageStatus = form.querySelector('[data-image-status]');
  const previewImage = imagePreview.querySelector('img');
  let imageBlob = null, currentImagePath = null, previewUrl = null, imageJob = 0;
  let guardando = false;
  let modo = 'agregar';
  let productos = [];
  let carga = 0;
  let categoriaAnterior = '';
  const selector = form.querySelector('#producto-selector');
  const categorySelect = form.elements.category;
  const campos = [...form.querySelectorAll('.producto-campos input, .producto-campos select')];
  const numericInputs = new Map([
    ['qty', configureIntegerInput(form.elements.qty, { min: 0 })],
    ['cost', configureIntegerInput(form.elements.cost, { min: 0 })],
    ['price', configureIntegerInput(form.elements.price, { min: 0 })],
    ['low_qty', configureIntegerInput(form.elements.low_qty, { min: 1 })]
  ]);
  const fechaLocal = valor => {
    const fecha = new Date(valor);
    return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const mostrarError = texto => { error.textContent = texto; error.hidden = false; };
  const limpiarPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null; previewImage.removeAttribute('src'); imagePreview.hidden = true;
  };
  imageInput.onchange = async () => {
    const file = imageInput.files?.[0]; const job = ++imageJob;
    imageBlob = null; limpiarPreview(); error.hidden = true;
    if (!file) return;
    guardar.disabled = true; imageStatus.textContent = 'Optimizando imagen…';
    try {
      const optimized = await optimizarImagenProducto(file);
      if (job !== imageJob) return;
      imageBlob = optimized.blob; previewUrl = URL.createObjectURL(imageBlob);
      previewImage.src = previewUrl; imagePreview.hidden = false;
      const size = Math.ceil(imageBlob.size / 1024);
      imageStatus.textContent = `WebP · ${optimized.width} × ${optimized.height} px · ${size} KB · calidad ${optimized.quality.toFixed(2)}`;
    } catch (err) {
      imageInput.value = ''; mostrarError(err.message);
    } finally { if (job === imageJob) guardar.disabled = modo !== 'agregar' && !selector.value; }
  };

  function abrir(tipo) {
    form.querySelector('label[for="producto-qty"]').textContent = tipo === 'agregar' ? 'Inventario Inicial' : 'Cantidad';
    const etiquetaSku = form.querySelector('label[for="producto-sku"]');
    if (etiquetaSku) etiquetaSku.textContent = tipo === 'modificar' ? 'Número de Identificación (SKU)' : 'SKU';
    form.querySelector('label[for="producto-cost"]').textContent = 'Costo Unitario (CLP)';
    carga++;
    modo = tipo;
    panel.querySelector('#opciones-inventario').hidden = true;
    panel.querySelector('[data-add-modify-inventory]').setAttribute('aria-expanded', 'false');
    form.reset();
    numericInputs.forEach(controller => controller?.set(''));
    numericInputs.get('qty')?.set(0);
    imageJob++; imageBlob = null; currentImagePath = null; limpiarPreview();
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
    imageField.hidden = tipo === 'borrar'; imageInput.disabled = tipo === 'borrar';
    dialogo.querySelector('h2').textContent = tipo === 'borrar' ? 'Eliminar producto' : tipo === 'modificar' ? 'Modificar producto' : 'Crear producto';
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
  async function cargarCategorias(solicitud,seleccionada='') {
    guardar.disabled = true; categorySelect.disabled = true;
    categorySelect.replaceChildren(new Option('Cargando categorías…',''));
    const url = new URL('/api/categories',apiUrl); url.searchParams.set('company_id',companyId);
    const response = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) throw new Error('No se pudieron cargar las categorías.');
    if (solicitud !== carga || !dialogo.open) return;
    categorySelect.replaceChildren(new Option('Selecciona una categoría',''));
    if (modo === 'agregar') categorySelect.add(new Option('+Nueva Categoría','__create__'));
    data.forEach(c => categorySelect.add(new Option(c.name,c.name)));
    categorySelect.value = seleccionada && data.some(c=>c.name===seleccionada) ? seleccionada
      : data.some(c=>c.name==='Sin Clasificar') ? 'Sin Clasificar' : '';
    categoriaAnterior = categorySelect.value;
    categorySelect.disabled = modo !== 'agregar';
    if (modo === 'agregar') guardar.disabled = false;
  }
  categorySelect.onfocus = () => { if (categorySelect.value !== '__create__') categoriaAnterior = categorySelect.value; };
  categorySelect.onchange = async () => {
    if (categorySelect.value !== '__create__') { categoriaAnterior = categorySelect.value; return; }
    const anterior = categoriaAnterior;
    categorySelect.value = anterior;
    if (typeof crearCategoria !== 'function') return;
    const solicitud = carga;
    const creada = await crearCategoria();
    if (solicitud !== carga || !dialogo.open) return;
    if (!creada) { categorySelect.value = anterior; return; }
    try { await cargarCategorias(solicitud,creada); }
    catch(err) { if (solicitud === carga && dialogo.open) mostrarError(err.message); }
  };
  panel.querySelector('[data-accion="agregar"]').onclick = async () => {
    abrir('agregar'); const solicitud = carga;
    try { await cargarCategorias(solicitud); }
    catch(err) { if (solicitud === carga && dialogo.open) mostrarError(err.message); }
  };
  async function abrirListado(tipo, productoId = null) {
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
      if (productoId != null) {
        const encontrado = productos.some(p => String(p.id) === String(productoId));
        if (!encontrado) throw new Error('El producto seleccionado ya no está disponible.');
        selector.value = String(productoId);
        selector.onchange();
        form.elements.name.focus?.();
      }
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
    numericInputs.forEach((controller, name) => controller?.set(producto?.[name] ?? ''));
    imageBlob = null; imageInput.value = ''; limpiarPreview();
    currentImagePath = producto?.image_path ?? null;
    if (producto && currentImagePath) { imagePreview.hidden = false; imageStatus.textContent = 'Este producto ya tiene una foto guardada. Selecciona otra para reemplazarla.'; }
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
    delete datos.image;
    if (modo !== 'borrar') {
    if (modo === 'agregar') delete datos.sku;
    datos.name = datos.name.trim();
    datos.category = datos.category.trim();
    for (const campo of ['qty', 'cost', 'price', 'low_qty']) datos[campo] = parseFormattedInteger(datos[campo]);
    if (!datos.name || !datos.category) return mostrarError('Completa el producto y la categoría.');
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
    let uploadedPath = null;
    let productRequestStarted = false;
    const eliminarImagen = async path => {
      const id = path?.match(/\/([0-9a-f-]{36})\.webp$/)?.[1];
      if (!id) return;
      const cleanup=new URL(`/api/product-images/${id}`,apiUrl); cleanup.searchParams.set('company_id',companyId);
      await fetch(cleanup,{method:'DELETE'}).catch(()=>{});
    };
    try {
      if (modo !== 'borrar' && imageBlob) {
        const imageUrl = new URL('/api/product-images',apiUrl); imageUrl.searchParams.set('company_id',companyId);
        const imageResponse = await fetch(imageUrl,{method:'POST',headers:{'Content-Type':'image/webp'},body:imageBlob,signal:AbortSignal.timeout(20000)});
        const imageResult = await imageResponse.json();
        if (!imageResponse.ok) throw new Error(imageResult.error || 'No se pudo subir la foto del producto.');
        uploadedPath = imageResult.path; datos.image_path = uploadedPath;
      } else if (modo !== 'borrar') datos.image_path = currentImagePath;
      const url = new URL(productoId ? `/api/products/${encodeURIComponent(productoId)}` : '/api/products', apiUrl);
      url.searchParams.set('company_id', companyId);
      productRequestStarted = true;
      const respuesta = await fetch(url, { method: modo === 'borrar' ? 'DELETE' : productoId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: modo === 'borrar' ? undefined : JSON.stringify(datos) });
      const resultado = await respuesta.json();
      if (!respuesta.ok) {
        await eliminarImagen(uploadedPath); uploadedPath = null;
        throw new Error(resultado.error || 'No se pudo guardar el producto.');
      }
      if (uploadedPath && currentImagePath && currentImagePath !== uploadedPath) {
        await eliminarImagen(currentImagePath);
      }
      uploadedPath = null;
      dialogo.close();
      await alGuardar();
      const productoFinal = modo === 'borrar' ? seleccionado : {...datos,...resultado};
      const action = modo === 'agregar' ? 'created' : modo === 'modificar' ? 'updated' : 'deleted';
      const description = action === 'created' ? descripcionProductoCreado(productoFinal)
        : action === 'updated' ? descripcionCambiosProducto(seleccionado, productoFinal, Boolean(imageBlob))
        : `${seleccionado.name}${seleccionado.sku ? ` · ${seleccionado.sku}` : ''}`;
      document.dispatchEvent(new CustomEvent('producto-guardado', {detail: {
        action,
        productId: String(productoFinal?.id || seleccionado?.id || ''),
        name: productoFinal?.name || seleccionado?.name || 'Producto',
        sku: productoFinal?.sku || seleccionado?.sku || '',
        description
      }}));
    } catch (err) {
      if (!productRequestStarted) await eliminarImagen(uploadedPath);
      mostrarError(err instanceof TypeError ? 'No se pudo confirmar el guardado. Revisa la conexión y actualiza el inventario antes de reintentar.' : err.message);
    } finally {
      guardando = false;
      guardar.disabled = cancelar.disabled = false;
      selector.disabled = modo === 'agregar';
      guardar.textContent = modo === 'borrar' ? 'Eliminar producto' : modo === 'modificar' ? 'Guardar cambios' : 'Guardar producto';
    }
  };
  return { abrirModificar: productoId => abrirListado('modificar', productoId) };
}
