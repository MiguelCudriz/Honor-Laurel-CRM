/* ================================================================
   logicaCatalogos.js — CRM Honor · Administración de catálogos
   ----------------------------------------------------------------
   Una sola pantalla para las ocho tablas de catálogo. La interfaz
   se dibuja con los metadatos que devuelve GET /api/catalogos-admin:
   columnas, etiquetas, longitudes, si tiene código DANE y si depende
   de un catálogo padre.

   Consecuencia práctica: habilitar un catálogo nuevo es agregar una
   línea en la lista blanca del backend. Este archivo no cambia.
   ================================================================ */

const API = 'http://localhost:5000/api';

// La sesión y los permisos los resuelve guard-sesion.js antes de este archivo.
const usuario = (window.CRM_SESION && window.CRM_SESION.usuario) || sessionStorage.getItem('crm_usuario');
const rol     = (window.CRM_SESION && window.CRM_SESION.rol)     || (sessionStorage.getItem('crm_rol') || '').toUpperCase();

document.getElementById('navUsuario').textContent  = usuario || '';
document.getElementById('navRolBadge').textContent = rol || '';

function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

/* ── ESTADO ──────────────────────────────────────────────────── */
let metadatos    = [];     // catálogos disponibles
let catActual    = null;   // metadatos del catálogo abierto
let filasActual  = [];     // filas tal como llegaron de la API
let opcionesPadre = [];    // elementos del catálogo padre, si aplica

/* ── UTILIDADES ──────────────────────────────────────────────── */
const TIMEOUT_MS = 20000;

// Mismo criterio que en el resto de la aplicación: un fallo de red o una
// respuesta con success:false no se puede confundir con "no hay datos".
async function api(ruta, opciones = {}) {
  const ctrl  = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${API}${ruta}`, {
      ...opciones,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Usuario': usuario || '',
        'X-Rol': rol || '',
        ...(opciones.headers || {})
      }
    });
    const json = await r.json().catch(() => null);
    if (!r.ok || (json && json.success === false))
      throw new Error((json && json.message) || `El servidor respondió ${r.status}.`);
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('El servidor tardó demasiado en responder.');
    throw e;
  } finally {
    clearTimeout(reloj);
  }
}

function toast(msg, tipo = 'ok') {
  Swal.fire({
    toast: true, position: 'top-end', timer: 3200, showConfirmButton: false,
    icon: tipo === 'ok' ? 'success' : 'error', title: msg
  });
}

function escapar(txt) {
  return String(txt ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── SELECTOR DE CATÁLOGOS ───────────────────────────────────── */
async function cargarCatalogos() {
  const cont = document.getElementById('catSelector');
  try {
    const res = await api('/catalogos-admin');
    metadatos = res.data || [];

    if (!metadatos.length) {
      cont.innerHTML = '<div class="cat-cargando">No hay catálogos administrables.</div>';
      return;
    }

    cont.innerHTML = metadatos.map(m => `
      <button class="cat-card" id="cat-btn-${m.clave}" onclick="abrirCatalogo('${m.clave}')">
        <i class="bi ${escapar(m.icono)}"></i>
        <span class="cat-card-titulo">${escapar(m.titulo)}</span>
        <span class="cat-card-total">${m.total} registro${m.total === 1 ? '' : 's'}</span>
      </button>`).join('');

    // Se abre el primero para que la pantalla no arranque vacía.
    abrirCatalogo(metadatos[0].clave);
  } catch (e) {
    cont.innerHTML = `
      <div class="cat-cargando cat-error">
        <i class="bi bi-exclamation-triangle me-1"></i>${escapar(e.message)}
        <button class="btn btn-primary ms-3" onclick="cargarCatalogos()">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </div>`;
  }
}

async function abrirCatalogo(clave) {
  catActual = metadatos.find(m => m.clave === clave);
  if (!catActual) return;

  document.querySelectorAll('.cat-card').forEach(b => b.classList.remove('activo'));
  document.getElementById(`cat-btn-${clave}`)?.classList.add('activo');

  document.getElementById('cardCatalogo').style.display = 'block';
  document.getElementById('catTitulo').textContent = catActual.titulo;
  document.getElementById('catIcono').className    = 'bi ' + catActual.icono;
  document.getElementById('catFiltro').value       = '';

  // Encabezados según lo que tenga este catálogo
  const cols = ['<th style="width:70px">ID</th>', `<th>${escapar(catActual.etiquetaNombre)}</th>`];
  if (catActual.tieneCodigo)   cols.push('<th style="width:110px">Código DANE</th>');
  if (catActual.catalogoPadre) cols.push(`<th>${escapar(catActual.etiquetaPadre)}</th>`);
  cols.push('<th style="width:90px">Estado</th>');
  cols.push('<th style="width:90px">En uso</th>');
  cols.push('<th style="width:130px">Acciones</th>');
  document.getElementById('catThead').innerHTML = `<tr>${cols.join('')}</tr>`;

  // Si depende de un padre, se precargan sus opciones para el formulario
  opcionesPadre = [];
  if (catActual.catalogoPadre) {
    try {
      const res = await api(`/catalogos-admin/${catActual.catalogoPadre}`);
      opcionesPadre = (res.data || []).filter(x => x.activo);
    } catch (_) { /* el formulario avisará si no hay opciones */ }
  }

  await cargarFilas();
}

async function cargarFilas() {
  const tbody = document.getElementById('catTbody');
  const cols  = document.getElementById('catThead').querySelectorAll('th').length;
  tbody.innerHTML = `<tr><td colspan="${cols}" class="cat-vacio"><span class="spinner"></span> Cargando...</td></tr>`;

  try {
    const res = await api(`/catalogos-admin/${catActual.clave}`);
    filasActual = res.data || [];
    filtrarLocal();

    // Se refresca el contador de la tarjeta sin volver a pedir metadatos.
    catActual.total = filasActual.length;
    const card = document.getElementById(`cat-btn-${catActual.clave}`);
    if (card) card.querySelector('.cat-card-total').textContent =
      `${filasActual.length} registro${filasActual.length === 1 ? '' : 's'}`;
  } catch (e) {
    tbody.innerHTML = `
      <tr><td colspan="${cols}" class="cat-vacio cat-error">
        <i class="bi bi-exclamation-triangle me-1"></i>${escapar(e.message)}
        <button class="btn btn-primary ms-3" onclick="cargarFilas()">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </td></tr>`;
  }
}

/* ── FILTRO EN MEMORIA ───────────────────────────────────────────
   El catálogo completo ya está en el navegador: filtrar aquí evita
   una petición por cada tecla. Municipios son más de mil filas y
   aun así responde al instante. */
function filtrarLocal() {
  const txt  = (document.getElementById('catFiltro').value || '').trim().toUpperCase();
  const solo = document.getElementById('catSoloActivos').checked;

  const filas = filasActual.filter(f => {
    if (solo && !f.activo) return false;
    if (!txt) return true;
    return [f.nombre, f.codigo, f.padre].some(v => (v || '').toUpperCase().includes(txt));
  });

  document.getElementById('catConteo').textContent =
    `${filas.length} de ${filasActual.length}`;

  render(filas);
}

function render(filas) {
  const tbody = document.getElementById('catTbody');
  const cols  = document.getElementById('catThead').querySelectorAll('th').length;

  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="${cols}" class="cat-vacio">
      <i class="bi bi-inbox me-1"></i>Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = filas.map(f => {
    const celdas = [
      `<td class="cat-id">${f.id}</td>`,
      `<td class="cat-nombre">${escapar(f.nombre)}</td>`
    ];
    if (catActual.tieneCodigo)   celdas.push(`<td>${escapar(f.codigo || '—')}</td>`);
    if (catActual.catalogoPadre) celdas.push(`<td>${escapar(f.padre || '—')}</td>`);

    celdas.push(`<td>${f.activo
      ? '<span class="cat-estado activo">Activo</span>'
      : '<span class="cat-estado inactivo">Inactivo</span>'}</td>`);

    celdas.push(`<td>${f.usos > 0
      ? `<span class="cat-usos" title="${f.usos} registro(s) lo usan">${f.usos}</span>`
      : '<span class="cat-usos cero">0</span>'}</td>`);

    celdas.push(`<td class="cat-acciones">
      <button class="cat-btn-icono" title="Editar" onclick="abrirFormulario(${f.id})">
        <i class="bi bi-pencil"></i></button>
      <button class="cat-btn-icono peligro" title="${f.usos > 0 ? 'Desactivar' : 'Eliminar'}"
              onclick="eliminar(${f.id})">
        <i class="bi ${f.usos > 0 ? 'bi-slash-circle' : 'bi-trash3'}"></i></button>
    </td>`);

    return `<tr class="${f.activo ? '' : 'fila-inactiva'}">${celdas.join('')}</tr>`;
  }).join('');
}

/* ── ALTA Y EDICIÓN ──────────────────────────────────────────── */
async function abrirFormulario(id = null) {
  const fila   = id ? filasActual.find(f => f.id === id) : null;
  const editar = !!fila;

  if (catActual.catalogoPadre && !opcionesPadre.length) {
    toast(`Primero crea al menos un registro en ${catActual.etiquetaPadre}.`, 'err');
    return;
  }

  const campoCodigo = catActual.tieneCodigo ? `
    <label class="swal-lbl">Código DANE (${catActual.largoCodigo} dígitos)</label>
    <input id="fCodigo" class="swal2-input swal-in" maxlength="${catActual.largoCodigo}"
           inputmode="numeric" value="${escapar(fila?.codigo || '')}"
           placeholder="${'0'.repeat(catActual.largoCodigo)}">` : '';

  const campoPadre = catActual.catalogoPadre ? `
    <label class="swal-lbl">${escapar(catActual.etiquetaPadre)}</label>
    <select id="fPadre" class="swal2-input swal-in">
      ${opcionesPadre.map(o =>
        `<option value="${o.id}" ${fila?.idPadre === o.id ? 'selected' : ''}>${escapar(o.nombre)}</option>`
      ).join('')}
    </select>` : '';

  const campoActivo = catActual.tieneActivo ? `
    <label class="swal-check">
      <input type="checkbox" id="fActivo" ${fila ? (fila.activo ? 'checked' : '') : 'checked'}>
      Activo (disponible en los formularios)
    </label>` : '';

  const { isConfirmed } = await Swal.fire({
    title: editar ? `Editar ${catActual.titulo.toLowerCase()}` : `Nuevo en ${catActual.titulo.toLowerCase()}`,
    html: `
      <div class="swal-form">
        <label class="swal-lbl">${escapar(catActual.etiquetaNombre)}</label>
        <input id="fNombre" class="swal2-input swal-in" maxlength="${catActual.largoNombre}"
               value="${escapar(fila?.nombre || '')}" placeholder="Máx. ${catActual.largoNombre} caracteres">
        ${campoCodigo}
        ${campoPadre}
        ${campoActivo}
      </div>`,
    width: 520,
    showCancelButton: true,
    confirmButtonText: editar ? 'Guardar cambios' : 'Crear',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#003087',
    cancelButtonColor: '#8896B0',
    reverseButtons: true,
    didOpen: () => document.getElementById('fNombre')?.focus(),
    preConfirm: async () => {
      const body = {
        nombre:  (document.getElementById('fNombre').value || '').trim(),
        codigo:  catActual.tieneCodigo ? (document.getElementById('fCodigo').value || '').trim() : null,
        idPadre: catActual.catalogoPadre ? parseInt(document.getElementById('fPadre').value) : null,
        activo:  catActual.tieneActivo ? document.getElementById('fActivo').checked : true
      };

      // Validación en el cliente para no gastar un viaje; el backend
      // vuelve a validar lo mismo porque es la única garantía real.
      if (body.nombre.length < 2)
        return Swal.showValidationMessage(`${catActual.etiquetaNombre} debe tener al menos 2 caracteres.`);

      if (catActual.tieneCodigo && !new RegExp(`^\\d{${catActual.largoCodigo}}$`).test(body.codigo || ''))
        return Swal.showValidationMessage(`El código DANE debe tener exactamente ${catActual.largoCodigo} dígitos.`);

      const duplicado = filasActual.some(f =>
        f.id !== id && (f.nombre || '').toUpperCase() === body.nombre.toUpperCase());
      if (duplicado)
        return Swal.showValidationMessage('Ya existe un elemento con ese nombre en este catálogo.');

      try {
        const res = editar
          ? await api(`/catalogos-admin/${catActual.clave}/${id}`, { method: 'PUT',  body: JSON.stringify(body) })
          : await api(`/catalogos-admin/${catActual.clave}`,       { method: 'POST', body: JSON.stringify(body) });
        return res.message || 'Guardado.';
      } catch (e) {
        return Swal.showValidationMessage(e.message);
      }
    }
  });

  if (isConfirmed) {
    toast(editar ? 'Cambios guardados.' : 'Elemento creado.');
    await cargarFilas();
  }
}

/* ── BAJA ────────────────────────────────────────────────────── */
async function eliminar(id) {
  const fila = filasActual.find(f => f.id === id);
  if (!fila) return;

  const enUso = fila.usos > 0;

  const { isConfirmed } = await Swal.fire({
    icon: 'warning',
    title: enUso ? '¿Desactivar elemento?' : '¿Eliminar elemento?',
    html: enUso
      ? `<strong>${escapar(fila.nombre)}</strong> lo usan <strong>${fila.usos}</strong> registro(s),
         así que no se puede eliminar sin romper el histórico.<br>
         Se marcará como <strong>inactivo</strong>: deja de ofrecerse en los
         formularios pero los registros existentes lo conservan.`
      : `<strong>${escapar(fila.nombre)}</strong> no lo usa ningún registro y se
         eliminará definitivamente.`,
    showCancelButton: true,
    confirmButtonText: enUso ? 'Desactivar' : 'Eliminar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#D93025',
    cancelButtonColor: '#8896B0',
    reverseButtons: true,
    focusCancel: true
  });

  if (!isConfirmed) return;

  try {
    const res = await api(`/catalogos-admin/${catActual.clave}/${id}`, { method: 'DELETE' });
    toast(res.message || 'Listo.');
    await cargarFilas();
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'No se pudo completar', text: e.message, confirmButtonColor: '#003087' });
  }
}

/* ── ARRANQUE ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', cargarCatalogos);
