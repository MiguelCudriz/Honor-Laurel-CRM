/* ================================================================
   logicaadmin.js — CRM Honor · Panel Administrador Consultores
   ================================================================ */

const API = 'http://localhost:5000/api';

// ── Auth guard ───────────────────────────────────────────────────
const sesionUsuario  = sessionStorage.getItem('crm_usuario');
const sesionRol      = sessionStorage.getItem('crm_rol');
const sesionRolUpper = sesionRol ? sesionRol.toUpperCase() : '';

if (!sesionUsuario) {
  window.location.href = 'index.html';
}
// Solo Admin (o Supervisor) puede estar aquí
if (sesionRolUpper !== 'ADMIN' && sesionRolUpper !== 'SUPERVISOR') {
  window.location.href = 'nueva-oportunidad.html';
}

document.getElementById('navUsuario').textContent  = sesionUsuario;
document.getElementById('navRolBadge').textContent = sesionRol || '—';

function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

// ── SHA-256 (misma función que el login) ─────────────────────────
async function sha256(message) {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('').toUpperCase();
}

// ── Sweet Alert Toast Helper ─────────────────────────────────────
const SwalToast = Swal.mixin({
  toast: true,
  position: 'bottom-end',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  didOpen: (t) => {
    t.addEventListener('mouseenter', Swal.stopTimer);
    t.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

function toast(msg, tipo = 'ok') {
  SwalToast.fire({
    icon: tipo === 'ok' ? 'success' : 'error',
    title: msg
  });
}

// ── Estado global ────────────────────────────────────────────────
let consultores    = [];
let roles          = [];
let editandoId     = null;   // null = creando, número = editando
let cambiandoPwdId = null;

// ── Carga inicial ────────────────────────────────────────────────
async function init() {
  try {
    const [rRes, cRes] = await Promise.all([
      fetch(`${API}/admin/roles`).then(r => r.json()),
      fetch(`${API}/admin/consultores`).then(r => r.json()),
    ]);
    roles       = rRes.data  || [];
    consultores = cRes.data  || [];
    renderEstadisticas();
    renderTabla();
    poblarSelectRoles();
  } catch (e) {
    console.error('Error init:', e);
    toast('No se pudo conectar con la API. Verifica que el backend esté activo en localhost:5000.', 'err');
  }
}

// ── Estadísticas ─────────────────────────────────────────────────
function renderEstadisticas() {
  const total    = consultores.length;
  const activos  = consultores.filter(c => c.activo).length;
  const inactivos = total - activos;
  const admins   = consultores.filter(c => {
    const r = (c.nombreRol || '').toUpperCase();
    return r === 'ADMIN' || r === 'SUPERVISOR';
  }).length;

  document.getElementById('statTotal').textContent     = total;
  document.getElementById('statActivos').textContent   = activos;
  document.getElementById('statInactivos').textContent = inactivos;
  document.getElementById('statAdmins').textContent    = admins;
}

// ── Tabla ────────────────────────────────────────────────────────
function renderTabla(filtro = '') {
  const tbody = document.getElementById('tbodyConsultores');
  const q = filtro.trim().toLowerCase();

  const filtrados = q
    ? consultores.filter(c =>
        (c.nombreCompleto || '').toLowerCase().includes(q) ||
        (c.email          || '').toLowerCase().includes(q) ||
        (c.usuario        || '').toLowerCase().includes(q))
    : consultores;

  if (filtrados.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <div class="empty-icon"><i class="bi bi-person-x"></i></div>
            <p>No se encontraron consultores${q ? ` con "${filtro}"` : ''}.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtrados.map(c => `
    <tr>
      <td>
        <strong>${c.nombreCompleto}</strong>
        ${c.email ? `<br><span style="font-size:0.78rem;color:#6B7A9A"><i class="bi bi-envelope me-1"></i>${c.email}</span>` : ''}
      </td>
      <td>
        ${c.usuario
          ? `<code style="background:var(--gris-suave);padding:2px 8px;border-radius:5px;font-size:0.82rem">${c.usuario}</code>`
          : '<span style="color:#B0BDD0">—</span>'}
      </td>
      <td><span class="badge ${badgeRol(c.nombreRol)}">${c.nombreRol || 'Sin Rol'}</span></td>
      <td>
        <span class="badge ${c.activo ? 'activo' : 'inactivo'}">
          <i class="bi bi-${c.activo ? 'check-circle-fill' : 'x-circle-fill'}"></i>
          ${c.activo ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td>
        <div class="row-actions">
          <button class="btn-icon edit" onclick="abrirModalEditar(${c.idConsultor})">
            <i class="bi bi-pencil-fill"></i> Editar
          </button>
          <button class="btn-icon pwd" onclick="abrirModalPassword(${c.idConsultor}, '${esc(c.nombreCompleto)}')">
            <i class="bi bi-key-fill"></i> Clave
          </button>
          ${c.activo
            ? `<button class="btn-icon off" onclick="toggleActivo(${c.idConsultor}, false, '${esc(c.nombreCompleto)}')">
                 <i class="bi bi-slash-circle"></i> Desactivar
               </button>`
            : `<button class="btn-icon on" onclick="toggleActivo(${c.idConsultor}, true, '${esc(c.nombreCompleto)}')">
                 <i class="bi bi-check-circle"></i> Activar
               </button>`}
        </div>
      </td>
    </tr>`).join('');
}

function badgeRol(rol) {
  if (!rol) return 'consultor';
  const r = rol.toUpperCase();
  if (r === 'ADMIN')      return 'admin';
  if (r === 'SUPERVISOR') return 'supervisor';
  return 'consultor';
}

function esc(s) { return (s || '').replace(/'/g, "\\'"); }

// ── Poblar select de roles en el modal ───────────────────────────
function poblarSelectRoles() {
  const sel = document.getElementById('modalIdRol');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin rol —</option>';
  roles.forEach(r => {
    const o = document.createElement('option');
    o.value = r.idRol;
    o.textContent = r.nombreRol;
    sel.appendChild(o);
  });
}

// ── Filtro en tiempo real ────────────────────────────────────────
document.getElementById('inputFiltro')
  .addEventListener('input', e => renderTabla(e.target.value));

// ── MODAL CREAR ──────────────────────────────────────────────────
function abrirModalCrear() {
  editandoId = null;
  document.getElementById('modalTitulo').textContent    = 'Nuevo Consultor';
  document.getElementById('modalSubtitulo').textContent = 'Completa los datos del nuevo consultor.';
  // Limpiar campos
  ['modalNombre','modalEmail','modalUsuario','modalClave'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('modalIdRol').value        = '';
  document.getElementById('modalActivo').checked     = true;
  document.getElementById('grupoPassword').style.display = 'grid';  // visible al crear
  document.getElementById('filaActivo').style.display   = 'none';   // oculto al crear
  document.getElementById('btnGuardarConsultor').innerHTML = '<i class="bi bi-check-circle me-1"></i>Guardar';
  abrirModal('modalConsultor');
}

// ── MODAL EDITAR ─────────────────────────────────────────────────
function abrirModalEditar(id) {
  editandoId = id;
  const c = consultores.find(x => x.idConsultor === id);
  if (!c) return;

  document.getElementById('modalTitulo').textContent    = 'Editar Consultor';
  document.getElementById('modalSubtitulo').textContent = `Modificando: ${c.nombreCompleto}`;
  document.getElementById('modalNombre').value   = c.nombreCompleto;
  document.getElementById('modalEmail').value    = c.email  || '';
  document.getElementById('modalUsuario').value  = c.usuario || '';
  document.getElementById('modalIdRol').value    = c.idRol  || '';
  document.getElementById('modalActivo').checked = c.activo;
  document.getElementById('grupoPassword').style.display = 'none';  // oculto al editar
  document.getElementById('filaActivo').style.display   = 'flex';   // visible al editar
  document.getElementById('btnGuardarConsultor').innerHTML = '<i class="bi bi-check-circle me-1"></i>Guardar';
  abrirModal('modalConsultor');
}

// ── GUARDAR CONSULTOR (crear o editar) ───────────────────────────
async function guardarConsultor() {
  const nombre  = document.getElementById('modalNombre').value.trim();
  const email   = document.getElementById('modalEmail').value.trim();
  const usuario = document.getElementById('modalUsuario').value.trim();
  const clave   = document.getElementById('modalClave').value;
  const idRol   = document.getElementById('modalIdRol').value || null;
  const activo  = document.getElementById('modalActivo').checked;

  if (!nombre || !usuario) {
    Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Nombre completo y usuario son obligatorios.', confirmButtonColor: '#003087' });
    return;
  }
  if (!editandoId && !clave) {
    Swal.fire({ icon: 'warning', title: 'Contraseña requerida', text: 'La contraseña inicial es obligatoria al crear un consultor.', confirmButtonColor: '#003087' });
    return;
  }
  if (!editandoId && clave.length < 6) {
    Swal.fire({ icon: 'warning', title: 'Contraseña muy corta', text: 'La contraseña debe tener al menos 6 caracteres.', confirmButtonColor: '#003087' });
    return;
  }

  const btn = document.getElementById('btnGuardarConsultor');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    let res;
    if (!editandoId) {
      // CREAR
      const hash = await sha256(clave);
      res = await fetch(`${API}/admin/consultores`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          nombreCompleto: nombre,
          email:          email   || null,
          usuario,
          passwordHash:   hash,
          idRol:          idRol ? parseInt(idRol) : null
        })
      });
    } else {
      // ACTUALIZAR
      res = await fetch(`${API}/admin/consultores/${editandoId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          nombreCompleto: nombre,
          email:          email   || null,
          usuario,
          idRol:          idRol ? parseInt(idRol) : null,
          activo
        })
      });
    }

    const data = await res.json();
    if (res.ok && data.success) {
      toast(data.message || 'Guardado correctamente.', 'ok');
      cerrarModal('modalConsultor');
      await recargar();
    } else {
      toast(data.message || 'Error al guardar. Revisa los datos.', 'err');
    }
  } catch (e) {
    console.error('guardarConsultor error:', e);
    toast('Error de conexión con la API.', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Guardar';
  }
}

// ── MODAL CAMBIAR CONTRASEÑA ─────────────────────────────────────
function abrirModalPassword(id, nombre) {
  cambiandoPwdId = id;
  document.getElementById('pwdNombre').textContent = nombre;
  document.getElementById('pwdNueva').value      = '';
  document.getElementById('pwdConfirmar').value  = '';
  document.getElementById('btnGuardarPwd').innerHTML = '<i class="bi bi-key-fill me-1"></i>Cambiar Contraseña';
  abrirModal('modalPassword');
}

async function guardarPassword() {
  const nueva     = document.getElementById('pwdNueva').value;
  const confirmar = document.getElementById('pwdConfirmar').value;

  if (!nueva || nueva.length < 6) {
    Swal.fire({ icon: 'warning', title: 'Contraseña muy corta', text: 'La contraseña debe tener al menos 6 caracteres.', confirmButtonColor: '#003087' });
    return;
  }
  if (nueva !== confirmar) {
    Swal.fire({ icon: 'error', title: 'No coinciden', text: 'Las contraseñas no coinciden.', confirmButtonColor: '#D93025' });
    return;
  }

  const btn = document.getElementById('btnGuardarPwd');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const hash = await sha256(nueva);
    const res  = await fetch(`${API}/admin/consultores/${cambiandoPwdId}/password`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ nuevoPasswordHash: hash })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast('Contraseña actualizada exitosamente.', 'ok');
      cerrarModal('modalPassword');
    } else {
      toast(data.message || 'Error al cambiar la contraseña.', 'err');
    }
  } catch (e) {
    console.error('guardarPassword error:', e);
    toast('Error de conexión con la API.', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-key-fill me-1"></i>Cambiar Contraseña';
  }
}

// ── ACTIVAR / DESACTIVAR ─────────────────────────────────────────
async function toggleActivo(id, activo, nombre) {
  const accion = activo ? 'activar' : 'desactivar';
  const result = await Swal.fire({
    title: `¿${activo ? 'Activar' : 'Desactivar'} consultor?`,
    html:  `¿Confirmas <strong>${accion}</strong> a <strong>${nombre}</strong>?`,
    icon:  activo ? 'question' : 'warning',
    showCancelButton:    true,
    confirmButtonColor:  activo ? '#39B54A' : '#D93025',
    cancelButtonColor:   '#A0AABF',
    confirmButtonText:   `<i class="bi bi-check2"></i> Sí, ${accion}`,
    cancelButtonText:    'Cancelar'
  });
  if (!result.isConfirmed) return;

  try {
    const res  = await fetch(`${API}/admin/consultores/${id}/toggle?activo=${activo}`, { method: 'PATCH' });
    const data = await res.json();
    if (res.ok && data.success) {
      toast(data.message, 'ok');
      await recargar();
    } else {
      toast(data.message || 'Error al actualizar el estado.', 'err');
    }
  } catch (e) {
    console.error('toggleActivo error:', e);
    toast('Error de conexión con la API.', 'err');
  }
}

// ── Recargar tabla desde BD ──────────────────────────────────────
async function recargar() {
  try {
    const res   = await fetch(`${API}/admin/consultores`).then(r => r.json());
    consultores = res.data || [];
    renderEstadisticas();
    renderTabla(document.getElementById('inputFiltro').value);
  } catch (e) {
    toast('Error al recargar la lista.', 'err');
  }
}

// ── Helpers de modal ─────────────────────────────────────────────
function abrirModal(id)  { document.getElementById(id).classList.add('open'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }

// Cerrar con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open')
      .forEach(m => m.classList.remove('open'));
  }
});

// ── Arranque ─────────────────────────────────────────────────────
init();

function verPipeline() {
  window.location.href = 'pipeline.html';
}