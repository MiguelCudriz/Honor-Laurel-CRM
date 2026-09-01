/* ================================================================
   logicaMetas.js — CRM Honor · Administrador de Metas Comerciales
   ================================================================ */

const API = 'http://localhost:5000/api';

// ── Auth guard (solo ADMIN) ───────────────────────────────────────
const sesionUsuario  = sessionStorage.getItem('crm_usuario');
const sesionRol      = (sessionStorage.getItem('crm_rol') || '').toUpperCase();
if (!sesionUsuario)           window.location.href = 'index.html';
if (sesionRol !== 'ADMIN')    window.location.href = 'nueva-oportunidad.html';

document.getElementById('navUsuario').textContent  = sesionUsuario;
document.getElementById('navRolBadge').textContent = sessionStorage.getItem('crm_rol') || '—';

function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

// ── Toast helper ──────────────────────────────────────────────────
const SwalToast = Swal.mixin({
  toast: true, position: 'bottom-end',
  showConfirmButton: false, timer: 4000, timerProgressBar: true,
  didOpen: t => {
    t.addEventListener('mouseenter', Swal.stopTimer);
    t.addEventListener('mouseleave', Swal.resumeTimer);
  }
});
function toast(msg, tipo = 'ok') {
  SwalToast.fire({ icon: tipo === 'ok' ? 'success' : 'error', title: msg });
}

// ── Helpers de formato ────────────────────────────────────────────
function parseMoney(str) {
  return parseFloat(String(str || '0').replace(/,/g, '')) || 0;
}
function formatMoney(v) {
  const n = Math.round(Math.abs(parseFloat(v) || 0));
  if (isNaN(n)) return '$0';
  return '$' + n.toLocaleString('es-CO');
}
function formatMoneyInput(v) {
  const n = Math.round(Math.abs(parseFloat(v) || 0));
  return n > 0 ? n.toLocaleString('en-US') : '';
}
function pctDisplay(v) { return (parseFloat(v) * 100).toFixed(2) + '%'; }

// ── Estado global ─────────────────────────────────────────────────
const MESES      = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

let metaActual        = null;   // data de la API para el año activo
let consultoresActivos = [];    // lista de consultores activos
let pctMeses          = new Array(12).fill(0);   // 0-indexed, valores 0..1
let pctConsultores    = {};     // {idConsultor: pct}

// ── INICIALIZACIÓN ────────────────────────────────────────────────
(async () => {
  await Promise.all([cargarAnios(), cargarConsultoresActivos()]);
  construirMesesGrid();

  // Autocargar el año actual si existe
  const anioActual = new Date().getFullYear();
  const sel = document.getElementById('selectAnio');
  const opt = Array.from(sel.options).find(o => parseInt(o.value) === anioActual);
  if (opt) { sel.value = anioActual; await cargarMeta(); }
})();

async function cargarAnios() {
  try {
    const res = await fetch(`${API}/metas/anios`).then(r => r.json());
    const anios = res.data || [];
    const sel   = document.getElementById('selectAnio');
    anios.forEach(a => {
      const o = document.createElement('option');
      o.value = a; o.textContent = a;
      sel.appendChild(o);
    });
    if (!anios.length) {
      document.getElementById('emptyState').style.display = 'flex';
    }
  } catch (e) { toast('Error cargando años.', 'err'); }
}

async function cargarConsultoresActivos() {
  try {
    const res = await fetch(`${API}/catalogos/consultores`).then(r => r.json());
    consultoresActivos = res.data || [];
  } catch (e) { console.warn('Error cargando consultores', e); }
}

// ── CARGAR META DE UN AÑO ─────────────────────────────────────────
async function cargarMeta() {
  const anio = document.getElementById('selectAnio').value;
  if (!anio) {
    document.getElementById('emptyState').style.display   = 'flex';
    document.getElementById('seccionMeta').style.display  = 'none';
    return;
  }

  const est = document.getElementById('estadoCarga');
  est.textContent = '⟳ Cargando...';

  try {
    const res = await fetch(`${API}/metas/${anio}`).then(r => r.json());

    if (!res.success || !res.data) {
      // Año nuevo sin datos — mostrar formulario vacío
      metaActual = null;
      resetFormulario(parseInt(anio));
      document.getElementById('emptyState').style.display   = 'none';
      document.getElementById('seccionMeta').style.display  = 'block';
      est.textContent = '';
      return;
    }

    metaActual = res.data;
    poblarFormulario(metaActual);
    document.getElementById('emptyState').style.display   = 'none';
    document.getElementById('seccionMeta').style.display  = 'block';
    est.textContent = '✓';
    setTimeout(() => { est.textContent = ''; }, 2000);

  } catch (e) {
    toast('Error cargando la meta.', 'err');
    est.textContent = '✗';
  }
}

function poblarFormulario(data) {
  // Meta total
  document.getElementById('metaTotalAnual').value = formatMoneyInput(data.metaTotalAnual);
  document.getElementById('metaDescripcion').value = data.descripcion || '';
  actualizarPreviewTotal(data.metaTotalAnual);

  // Distribución mensual
  pctMeses = data.distribucionMensual.map(d => parseFloat(d.porcentajeMes));
  actualizarMesesGrid();
  actualizarPreviewMeses();

  // Consultores
  pctConsultores = {};
  data.metasConsultores.forEach(c => {
    pctConsultores[c.idConsultor] = parseFloat(c.porcentajeConsultor);
  });
  renderTablaConsultores();
}

function resetFormulario(anio) {
  document.getElementById('metaTotalAnual').value  = '';
  document.getElementById('metaDescripcion').value = `Presupuesto Comercial ${anio}`;
  pctMeses = new Array(12).fill(1/12);
  pctConsultores = {};
  actualizarMesesGrid();
  actualizarPreviewMeses();
  actualizarPreviewTotal(0);
  renderTablaConsultores();
}

// ── CREAR NUEVO AÑO ───────────────────────────────────────────────
async function crearNuevoAnio() {
  const { value: anio } = await Swal.fire({
    title: 'Nuevo año de metas',
    input: 'number',
    inputLabel: 'Año (ej: 2027)',
    inputAttributes: { min: 2020, max: 2050, step: 1 },
    inputValue: new Date().getFullYear() + 1,
    showCancelButton: true,
    confirmButtonColor: '#003087',
    confirmButtonText: 'Crear',
    cancelButtonText: 'Cancelar',
    inputValidator: v => (!v || v < 2020 || v > 2050) ? 'Ingresa un año válido (2020–2050)' : null
  });
  if (!anio) return;

  const sel = document.getElementById('selectAnio');
  // Agregar opción si no existe
  if (!Array.from(sel.options).find(o => parseInt(o.value) === parseInt(anio))) {
    const o = document.createElement('option');
    o.value = anio; o.textContent = anio;
    // Insertar en orden
    const opts = Array.from(sel.options).filter(o => o.value);
    const idx  = opts.findIndex(o => parseInt(o.value) < parseInt(anio));
    if (idx >= 0) sel.insertBefore(o, opts[idx]);
    else sel.appendChild(o);
  }
  sel.value = anio;
  await cargarMeta();
}

// ── GRID DE MESES ─────────────────────────────────────────────────
function construirMesesGrid() {
  const grid = document.getElementById('mesesGrid');
  grid.innerHTML = MESES.map((m, i) => `
    <div class="mes-card" id="mesCard${i}">
      <div class="mes-nombre">${m}</div>
      <div class="mes-input-wrap">
        <input type="number" class="mes-pct-input" id="mesPct${i}"
               min="0" max="100" step="0.01"
               value="0"
               oninput="onMesPctInput(${i}, this.value)">
        <span class="mes-pct-symbol">%</span>
      </div>
      <div class="mes-valor-preview" id="mesValor${i}">$0</div>
    </div>`).join('');
}

function actualizarMesesGrid() {
  MESES.forEach((_, i) => {
    const el = document.getElementById(`mesPct${i}`);
    if (el) el.value = (pctMeses[i] * 100).toFixed(2);
  });
  actualizarSumaPct();
  actualizarPreviewMeses();
}

function onMesPctInput(idx, val) {
  pctMeses[idx] = Math.max(0, Math.min(100, parseFloat(val) || 0)) / 100;
  actualizarSumaPct();
  actualizarPreviewMeses();
}

function actualizarSumaPct() {
  const suma = pctMeses.reduce((s, v) => s + v, 0);
  const sumaPct = (suma * 100).toFixed(2);
  const badge   = document.getElementById('sumaPctBadge');
  const valor   = document.getElementById('sumaPctValor');
  const label   = document.getElementById('sumaPctLabel');
  valor.textContent = sumaPct + '%';
  label.textContent = 'de 100%';
  const ok = Math.abs(suma - 1) <= 0.001;
  badge.className   = 'suma-pct-badge' + (ok ? ' ok' : ' err');
  // Colorear cards
  const max = Math.max(...pctMeses);
  MESES.forEach((_, i) => {
    const card = document.getElementById(`mesCard${i}`);
    if (card) {
      card.className = 'mes-card' + (pctMeses[i] === max ? ' mes-top' : '');
    }
  });
  return ok;
}

function actualizarPreviewMeses() {
  const total = parseMoney(document.getElementById('metaTotalAnual').value);
  const wrap  = document.getElementById('mesesPreview');
  wrap.innerHTML = `
    <table class="tabla-preview-meses">
      <thead><tr>
        <th>Mes</th><th>%</th><th>Meta Mensual / Anual</th><th>Meta Acumulada</th>
        <th title="Meta Mensual ÷ meses restantes incluyendo ese mes">Meta / Mes</th>
      </tr></thead>
      <tbody>
        ${MESES.map((m, i) => {
          const v    = total * pctMeses[i];
          const acum = total * pctMeses.slice(0, i+1).reduce((s,x)=>s+x, 0);
          // Meta mensual dividida entre los meses restantes incluyendo este (escalera lineal)
          const mesesRest = 12 - i;
          const porMesRest = v / mesesRest;
          // Update card preview
          const elV = document.getElementById(`mesValor${i}`);
          if (elV) elV.textContent = formatMoney(v);
          return `<tr>
            <td><strong>${m}</strong></td>
            <td>${(pctMeses[i]*100).toFixed(2)}%</td>
            <td>${formatMoney(v)}</td>
            <td style="color:#6B7A9A">${formatMoney(acum)}</td>
            <td style="color:var(--verde-dark);font-weight:600">${formatMoney(porMesRest)}</td>
          </tr>`;
        }).join('')}
        <tr class="preview-total-row">
          <td><strong>TOTAL</strong></td>
          <td><strong>${(pctMeses.reduce((s,v)=>s+v,0)*100).toFixed(2)}%</strong></td>
          <td><strong>${formatMoney(total)}</strong></td>
          <td><strong>${formatMoney(total)}</strong></td>
          <td>—</td>
        </tr>
      </tbody>
    </table>`;
}

// ── META TOTAL INPUT ──────────────────────────────────────────────
function onMetaTotalInput(el) {
  let raw = parseMoney(el.value);
  el.value = raw > 0 ? formatMoneyInput(raw) : '';
  actualizarPreviewTotal(raw);
  actualizarPreviewMeses();
  renderTablaConsultores();
}

function actualizarPreviewTotal(v) {
  document.getElementById('metaTotalPreview').textContent = formatMoney(v);
}

// ── TABLA CONSULTORES ─────────────────────────────────────────────
function renderTablaConsultores() {
  const total = parseMoney(document.getElementById('metaTotalAnual').value);
  const tbody = document.getElementById('tbodyConsultores');
  const tfoot = document.getElementById('tfootConsultores');

  tbody.innerHTML = consultoresActivos.map(c => {
    const pct      = pctConsultores[c.id] || 0;
    const metaAnual= total * pct;
    const metaMes  = metaAnual / 12;
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="consultor-avatar">${c.descripcion.charAt(0)}</div>
          <strong>${c.descripcion}</strong>
        </div>
      </td>
      <td>
        <div class="pct-input-wrap">
          <input type="text" class="pct-cons-input" id="consPct${c.id}"
                 inputmode="decimal"
                 value="${(pct * 100).toFixed(2)}"
                 onfocus="this.select()"
                 onblur="onConsPctBlur(${c.id}, this)"
                 oninput="onConsPctInputLive(${c.id}, this.value)">
          <span class="pct-sym">%</span>
        </div>
      </td>
      <td class="num-cell">${formatMoney(metaAnual)}</td>
      <td class="num-cell">${formatMoney(metaMes)}</td>
      <td style="text-align:center">
        <button class="btn-ver-escalera" onclick="verEscaleraConsultor(${c.id}, '${c.descripcion}')"
                title="Ver escalera mensual">
          <i class="bi bi-graph-up-arrow"></i>
        </button>
      </td>
    </tr>`;
  }).join('');

  // Footer con suma
  const sumaCons = Object.values(pctConsultores).reduce((s, v) => s + v, 0);
  const sumaPct  = (sumaCons * 100).toFixed(2);
  const ok       = Math.abs(sumaCons - 1) <= 0.001;
  const badge    = document.getElementById('sumaConsBadge');
  document.getElementById('sumaConsValor').textContent = sumaPct + '%';
  badge.className = 'suma-pct-badge' + (ok ? ' ok' : (sumaCons > 0 ? ' err' : ''));

  tfoot.innerHTML = `<tr class="tfoot-total">
    <td><strong>TOTAL CONSULTORES</strong></td>
    <td class="${ok ? 'ok-cell' : 'err-cell'}"><strong>${sumaPct}%</strong></td>
    <td class="num-cell"><strong>${formatMoney(total * sumaCons)}</strong></td>
    <td class="num-cell"><strong>${formatMoney(total * sumaCons / 12)}</strong></td>
    <td></td>
  </tr>`;
}

function onConsPctInputLive(idConsultor, val) {
  // Permite escribir libremente (ej: "25.98") sin actualizar hasta blur
  // Solo actualiza el preview en tiempo real sin re-renderizar la tabla completa
  const num = parseFloat(val.replace(',', '.')) || 0;
  pctConsultores[idConsultor] = Math.max(0, Math.min(100, num)) / 100;
  actualizarSumaConsultoresLive();
  actualizarFilaConsultor(idConsultor);
}

function onConsPctBlur(idConsultor, el) {
  // Al perder el foco: normaliza y re-renderiza completo
  const num = parseFloat(el.value.replace(',', '.')) || 0;
  const clamped = Math.max(0, Math.min(100, num));
  pctConsultores[idConsultor] = clamped / 100;
  el.value = clamped.toFixed(2);
  renderTablaConsultores();
  cerrarEscalera();
}

function actualizarFilaConsultor(idConsultor) {
  const total = parseMoney(document.getElementById('metaTotalAnual').value);
  const pct   = pctConsultores[idConsultor] || 0;
  const metaAnual = total * pct;
  const metaMes   = metaAnual / 12;
  // Actualizar solo las celdas de valor sin tocar el input
  const filas = document.querySelectorAll(`#tbodyConsultores tr`);
  filas.forEach(tr => {
    const inp = tr.querySelector('.pct-cons-input');
    if (inp && inp.id === `consPct${idConsultor}`) {
      const tds = tr.querySelectorAll('td');
      if (tds[2]) tds[2].textContent = formatMoney(metaAnual);
      if (tds[3]) tds[3].textContent = formatMoney(metaMes);
    }
  });
}

function actualizarSumaConsultoresLive() {
  const sumaCons = Object.values(pctConsultores).reduce((s, v) => s + v, 0);
  const sumaPct  = (sumaCons * 100).toFixed(2);
  const ok       = Math.abs(sumaCons - 1) <= 0.001;
  const badge    = document.getElementById('sumaConsBadge');
  document.getElementById('sumaConsValor').textContent = sumaPct + '%';
  badge.className = 'suma-pct-badge' + (ok ? ' ok' : (sumaCons > 0 ? ' err' : ''));
}

function onConsPctInput(idConsultor, val) {
  pctConsultores[idConsultor] = Math.max(0, Math.min(100, parseFloat(val) || 0)) / 100;
  renderTablaConsultores();
  cerrarEscalera();
}

function distribuirConsultoresIgual() {
  if (!consultoresActivos.length) return;
  const pctIgual = 1 / consultoresActivos.length;
  consultoresActivos.forEach(c => { pctConsultores[c.id] = pctIgual; });
  renderTablaConsultores();
  toast(`${consultoresActivos.length} consultores distribuidos equitativamente (${(pctIgual*100).toFixed(2)}% c/u).`);
}

// ── ESCALERA MENSUAL DEL CONSULTOR ───────────────────────────────
function verEscaleraConsultor(idCons, nombre) {
  const total   = parseMoney(document.getElementById('metaTotalAnual').value);
  const pctCons = pctConsultores[idCons] || 0;
  const metaConsAnual = total * pctCons;
  const sumaTotalPct  = pctMeses.reduce((s, v) => s + v, 0);

  document.getElementById('escaleraConsNombre').textContent = nombre;
  const grid = document.getElementById('escaleraGrid');
  grid.innerHTML = MESES.map((m, i) => {
    const metaMes   = metaConsAnual * pctMeses[i];
    // Meta/Mes restante: MetaMensual del consultor ÷ meses restantes incluyendo este
    const mesesRest = 12 - i;
    const escalera  = metaMes / mesesRest;
    return `<div class="escalera-mes">
      <div class="esc-mes-nombre">${m}</div>
      <div class="esc-mes-meta">${formatMoney(metaMes)}</div>
      <div class="esc-mes-escalera" title="Meta mensual ÷ ${mesesRest} mes${mesesRest!==1?'es':''}">
        <i class="bi bi-arrow-up-short"></i>${formatMoney(escalera)}
      </div>
    </div>`;
  }).join('');

  document.getElementById('escaleraPreview').style.display = 'block';
  document.getElementById('escaleraPreview').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cerrarEscalera() {
  document.getElementById('escaleraPreview').style.display = 'none';
}

// ── RESET DISTRIBUCIÓN MENSUAL ─────────────────────────────────────
function resetDistribucionMensual() {
  if (metaActual) {
    pctMeses = metaActual.distribucionMensual.map(d => parseFloat(d.porcentajeMes));
    document.getElementById('metaTotalAnual').value = formatMoneyInput(metaActual.metaTotalAnual);
    document.getElementById('metaDescripcion').value = metaActual.descripcion || '';
    actualizarPreviewTotal(metaActual.metaTotalAnual);
  } else {
    pctMeses = new Array(12).fill(1/12);
  }
  actualizarMesesGrid();
  actualizarPreviewMeses();
  toast('Valores restaurados desde la última versión guardada.');
}

// ── GUARDAR META ANUAL ────────────────────────────────────────────
async function guardarMetaAnual() {
  const anio  = parseInt(document.getElementById('selectAnio').value);
  const total = parseMoney(document.getElementById('metaTotalAnual').value);

  if (!anio)    { toast('Selecciona un año.', 'err'); return; }
  if (!total)   { toast('Ingresa la meta total anual.', 'err'); return; }

  if (!actualizarSumaPct()) {
    toast('Los porcentajes mensuales deben sumar exactamente 100%.', 'err');
    return;
  }

  const confirm = await Swal.fire({
    icon: 'question',
    title: `Guardar meta ${anio}`,
    html: `Meta total: <strong>${formatMoney(total)}</strong><br>¿Confirmas la distribución mensual?`,
    showCancelButton: true,
    confirmButtonColor: '#003087',
    confirmButtonText: 'Sí, guardar',
    cancelButtonText: 'Cancelar',
  });
  if (!confirm.isConfirmed) return;

  const btn = document.getElementById('btnGuardarAnual');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-btn"></span>Guardando...';

  try {
    const body = {
      anio,
      metaTotalAnual: total,
      descripcion: document.getElementById('metaDescripcion').value.trim() || null,
      porcentajesMensuales: pctMeses
    };
    const res  = await fetch(`${API}/metas/guardar-anual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast(`Meta anual ${anio} guardada correctamente.`);
      await cargarMeta();
    } else {
      toast(data.message || 'Error al guardar.', 'err');
    }
  } catch (e) { toast('Error de conexión.', 'err'); }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-floppy-fill me-1"></i>Guardar Meta Anual';
  }
}

// ── GUARDAR METAS CONSULTORES ─────────────────────────────────────
async function guardarMetasConsultores() {
  const anio = parseInt(document.getElementById('selectAnio').value);
  if (!anio) { toast('Selecciona un año.', 'err'); return; }

  const lista = consultoresActivos.map(c => ({
    idConsultor: c.id,
    pct: pctConsultores[c.id] || 0
  })).filter(c => c.pct > 0);

  if (!lista.length) { toast('Asigna % a al menos un consultor.', 'err'); return; }

  const sumaCons = lista.reduce((s, c) => s + c.pct, 0);
  if (Math.abs(sumaCons - 1) > 0.001) {
    toast(`Los porcentajes suman ${(sumaCons*100).toFixed(2)}%. Deben ser exactamente 100%.`, 'err');
    return;
  }

  const confirm = await Swal.fire({
    icon: 'question',
    title: 'Guardar metas por consultor',
    html: `Se asignarán cuotas a <strong>${lista.length}</strong> consultor(es) para el año <strong>${anio}</strong>.`,
    showCancelButton: true,
    confirmButtonColor: '#003087',
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar',
  });
  if (!confirm.isConfirmed) return;

  const btn = document.getElementById('btnGuardarConsultores');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-btn"></span>Guardando...';

  try {
    const body = { anio, consultores: lista };
    const res  = await fetch(`${API}/metas/guardar-consultores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast(`Metas por consultor guardadas para ${anio}.`);
      await cargarMeta();
    } else {
      toast(data.message || 'Error al guardar.', 'err');
    }
  } catch (e) { toast('Error de conexión.', 'err'); }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-floppy-fill me-1"></i>Guardar Metas Consultores';
  }
}
