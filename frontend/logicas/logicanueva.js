/* ================================================================
   logicanueva.js — CRM Honor · Nueva Oportunidad Comercial
   [v4] Flujo tipo wizard:
     Paso 1: Tipo de cliente (único visible al iniciar)
     Paso 2: Datos del cliente (búsqueda estilo Municipio para
             Actual/Profundización)
     Paso 3: Fase actual de la oportunidad
     Paso 4: Resto del formulario, con campos habilitados/ocultos
             según el grupo de fase elegido:
               - CONTACTO (Email/Telefónico): mínimo indispensable
               - LIBRE (Inscripción/Visita/Licitación Abierta): formulario
                 completo tal como estaba antes (permite $0)
               - COTIZACION (Presentación/Sustentación/Negociación/Venta):
                 formulario completo + N° Cotización obligatorio
   ================================================================ */

const API = 'http://localhost:5000/api';
let todosLosClientes    = [];
let todosLosMunicipios  = [];
let modoCliente         = null;
let clienteSeleccionado = null;
let clienteProfSeleccionado = null;
let debounceTimer       = null;
let debounceTimerProf   = null;
let resultadosClienteCache     = [];
let resultadosClienteProfCache = [];

// ── AUTH ─────────────────────────────────────────────────────────
const usuario = sessionStorage.getItem('crm_usuario');
if (!usuario) window.location.href = 'index.html';
document.getElementById('navUsuario').textContent = usuario;

// [v5] La visibilidad de los enlaces del navbar/sidebar la resuelve
//      guard-sesion.js segun la matriz PERMISOS. No duplicar reglas aqui.
const rol = (window.CRM_SESION && window.CRM_SESION.rol) || sessionStorage.getItem('crm_rol');

function logout() {
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// ── MESES ─────────────────────────────────────────────────────────
const NOMBRES_MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

// ── FASES EXCLUIDAS (no aparecen en nueva oportunidad) ────────────
// Estas fases solo tienen sentido como resultado de una actualización,
// nunca como punto de partida de una oportunidad nueva.
const FASES_EXCLUIDAS = ['NO PRESENTADO', 'NO ADJUDICADO', 'PASO DE MES'];

// ── FASES QUE PERMITEN VALORES EN $0 ─────────────────────────────
const FASES_PERMITEN_CERO = [
  'CONTACTO E-MAIL',
  'CONTACTO EMAIL',
  'CONTACTO TELEFONICO',
  'INSCRIPCION PROVEEDOR',
  'VISITA A CLIENTE',
  'LICITACION ABIERTA',
];

// ── GRUPOS DE FASE (definen qué campos se piden) ─────────────────
// Grupo "contacto": solo lo indispensable (Servicio, Ubicación, Consultor,
//                    Fecha, Observación). Modalidad/Tiempo quedan en NULL
//                    y se completan más adelante desde Actualizar/Consultar.
const FASES_CONTACTO = ['CONTACTO E-MAIL', 'CONTACTO EMAIL', 'CONTACTO TELEFONICO'];

// Grupo "cotizacion": formulario completo + N° Cotización obligatorio.
const FASES_COTIZACION_OBLIGATORIA = [
  'PRESENTACION DE PROPUESTA',
  'SUSTENTACION DE PROPUESTA',
  'NEGOCIACION',
  'VENTA',
];

// El resto de fases visibles (INSCRIPCION PROVEEDOR, VISITA A CLIENTE,
// LICITACION ABIERTA) cae en el grupo "libre": formulario completo, tal
// como se presentaba antes, sin campos ocultos ni cotización obligatoria.

// Normaliza texto: quita acentos, mayúsculas, sin espacios extra
function normalizarTexto(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function fasePermiteValorCero() {
  const sel  = document.getElementById('idFaseVenta');
  const desc = normalizarTexto(sel.options[sel.selectedIndex]?.text || '');
  return FASES_PERMITEN_CERO.some(f => {
    const fn = normalizarTexto(f);
    return desc === fn || desc.includes(fn);
  });
}

/** Devuelve 'contacto' | 'cotizacion' | 'libre' | null (sin fase elegida aún) */
function obtenerGrupoFase() {
  const sel  = document.getElementById('idFaseVenta');
  const desc = normalizarTexto(sel.options[sel.selectedIndex]?.text || '');
  if (!desc) return null;
  if (FASES_CONTACTO.some(f => desc === normalizarTexto(f))) return 'contacto';
  if (FASES_COTIZACION_OBLIGATORIA.some(f => desc === normalizarTexto(f))) return 'cotizacion';
  return 'libre';
}

// ── INDICADOR DE PASOS (wizard) ───────────────────────────────────
function marcarPaso(n) {
  [1, 2, 3, 4].forEach(i => {
    const el = document.getElementById(`wsPaso${i}`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < n) el.classList.add('done');
    else if (i === n) el.classList.add('active');
  });
}

// ── PASO 1 → PASO 2: SELECTOR MODO CLIENTE ────────────────────────
function seleccionarModo(modo) {
  modoCliente = modo;

  document.getElementById('btnNuevo').className        = 'btn-tipo' + (modo === 'nuevo'         ? ' activo-nuevo'         : '');
  document.getElementById('btnActual').className       = 'btn-tipo' + (modo === 'actual'        ? ' activo-actual'        : '');
  document.getElementById('btnProfundizacion').className = 'btn-tipo' + (modo === 'profundizacion' ? ' activo-profundizacion' : '');

  document.getElementById('stepTipo').style.display = 'none';

  const card = document.getElementById('cardCliente');
  card.style.display = 'block';
  card.style.animation = 'none';
  requestAnimationFrame(() => { card.style.animation = ''; });

  document.getElementById('panelNuevo').style.display         = 'none';
  document.getElementById('panelActual').style.display        = 'none';
  document.getElementById('panelProfundizacion').style.display = 'none';

  const tag   = document.getElementById('cardClienteTag');
  const titulo = document.getElementById('cardClienteTitulo');

  if (modo === 'nuevo') {
    titulo.textContent    = 'Nuevo Prospecto / Cliente';
    tag.textContent       = 'NUEVO';
    tag.style.background  = 'var(--verde)';
    document.getElementById('panelNuevo').style.display = 'block';
    ['nitNuevo','razonSocialNuevo','telNuevo','correoNuevo'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('sectorNuevo').selectedIndex = 0;
    clienteSeleccionado = null;

  } else if (modo === 'actual') {
    titulo.textContent    = 'Buscar Cliente Existente';
    tag.textContent       = 'ACTUAL';
    tag.style.background  = 'var(--azul-claro)';
    document.getElementById('panelActual').style.display = 'block';
    limpiarBusquedaActual();

  } else if (modo === 'profundizacion') {
    titulo.textContent    = 'Profundización de Servicio';
    tag.textContent       = 'PROFUNDIZACIÓN';
    tag.style.background  = '#7B2FBE';
    document.getElementById('panelProfundizacion').style.display = 'block';
    limpiarBusquedaProf();
  }

  marcarPaso(2);
  setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function volverATipo() {
  document.getElementById('cardCliente').style.display = 'none';
  document.getElementById('stepTipo').style.display = 'block';
  ['btnNuevo','btnActual','btnProfundizacion'].forEach(id => {
    document.getElementById(id).className = 'btn-tipo';
  });
  modoCliente = null;
  marcarPaso(1);
}

// ── PASO 2 → PASO 3: VALIDAR CLIENTE Y CONTINUAR ──────────────────
function continuarDesdeCliente() {
  if (!modoCliente) {
    toast('Selecciona el tipo de cliente antes de continuar.', 'err');
    return;
  }

  let nombreResumen = '';

  if (modoCliente === 'nuevo') {
    const razonSocial = document.getElementById('razonSocialNuevo').value.trim();
    const sector       = document.getElementById('sectorNuevo').value;
    const razonEl = document.getElementById('razonSocialNuevo');
    if (!razonSocial) { razonEl.classList.add('error'); toast('La Razón Social es obligatoria.', 'err'); return; }
    razonEl.classList.remove('error');
    if (!sector) { toast('Selecciona el Sector Económico.', 'err'); return; }
    nombreResumen = razonSocial.toUpperCase();

  } else if (modoCliente === 'actual') {
    if (!clienteSeleccionado) { toast('Busca y selecciona un cliente existente.', 'err'); return; }
    if (!document.getElementById('sectorActual').value) { toast('Selecciona el Sector Económico.', 'err'); return; }
    nombreResumen = clienteSeleccionado.razonSocial;

  } else if (modoCliente === 'profundizacion') {
    if (!clienteProfSeleccionado) { toast('Busca y selecciona el cliente a profundizar.', 'err'); return; }
    if (!document.getElementById('sectorProfundizacion').value) { toast('Selecciona el Sector Económico.', 'err'); return; }
    nombreResumen = clienteProfSeleccionado.razonSocial;
  }

  const badgeTxt = { nuevo: 'NUEVO', actual: 'ACTUAL', profundizacion: 'PROFUNDIZACIÓN' }[modoCliente];
  const bar = document.getElementById('resumenCliente');
  document.getElementById('resumenClienteTexto').innerHTML =
    `<strong>${nombreResumen}</strong> <span class="resumen-tag">${badgeTxt}</span>`;
  bar.style.display = 'flex';

  document.getElementById('cardCliente').style.display = 'none';
  document.getElementById('cardFase').style.display    = 'block';
  marcarPaso(3);
  setTimeout(() => document.getElementById('cardFase').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function volverACliente() {
  document.getElementById('cardFase').style.display        = 'none';
  document.getElementById('restoFormulario').style.display = 'none';
  document.getElementById('resumenCliente').style.display  = 'none';
  document.getElementById('cardCliente').style.display     = 'block';
  marcarPaso(2);
  setTimeout(() => document.getElementById('cardCliente').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

// ── PASO 3 → PASO 4: FASE SELECCIONADA (auto-despliega el resto) ─
function onFaseSeleccionada() {
  const grupo = obtenerGrupoFase();
  const resto = document.getElementById('restoFormulario');

  if (!grupo) { resto.style.display = 'none'; return; }

  const esContacto   = grupo === 'contacto';
  const esCotizacion = grupo === 'cotizacion';

  // Campos que solo aplican fuera del grupo "contacto".
  // grpMesFin NO va en esta lista: es un campo derivado que ahora está
  // siempre oculto por CSS (.campo-oculto). Se sigue calculando y enviando.
  ['grpModalidad', 'grpTiempo', 'grpMesInicio',
   'grpFechaInicio', 'grpFechaFin', 'grpLicitacion',
   'grpValorMensual', 'grpCosto', 'grpAiuPreview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = esContacto ? 'none' : '';
  });

  // N° Cotización: oculto en Contacto, visible en las demás (obligatorio en grupo cotizacion)
  document.getElementById('grpCotizacion').style.display = esContacto ? 'none' : '';
  document.getElementById('reqCotizacion').style.display = esCotizacion ? 'inline' : 'none';
  document.getElementById('hintCotizacion').innerHTML = esCotizacion
    ? '<i class="bi bi-exclamation-circle me-1"></i>Obligatorio en esta fase'
    : '<i class="bi bi-info-circle me-1"></i>Opcional · puedes asignarlo después';

  const selFase = document.getElementById('idFaseVenta');
  document.getElementById('badgeFaseElegida').textContent =
    selFase.options[selFase.selectedIndex]?.text || 'FASE';

  resto.style.display = 'block';
  ajustarSecciones();
  marcarPaso(4);
  setTimeout(() => resto.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

// Oculta un bloque completo cuando todos sus campos quedaron ocultos, para no
// dejar tarjetas con encabezado y nada dentro (ej. "Vigencia del Servicio" en
// las fases de Contacto, donde no se piden fechas).
function ajustarSecciones() {
  document.querySelectorAll('[data-seccion]').forEach(bloque => {
    const visibles = Array.from(bloque.querySelectorAll('.field'))
      .filter(f => !f.classList.contains('campo-oculto') && f.style.display !== 'none');
    bloque.style.display = visibles.length ? '' : 'none';
  });
}

// ── BÚSQUEDA CLIENTE ACTUAL — estilo Municipio (input + select resultados) ──
function buscarClienteDebounce() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(buscarCliente, 350);
}

async function buscarCliente() {
  const q   = document.getElementById('buscarCliente').value.trim();
  const sel = document.getElementById('selectResultadosCliente');

  if (q.length < 3) {
    sel.style.display = 'none';
    sel.innerHTML = '<option value="">— Resultados —</option>';
    return;
  }
  try {
    const res = await fetch(`${API}/clientes/buscar?criterio=${encodeURIComponent(q)}`).then(r => r.json());
    resultadosClienteCache = res.data || [];
    if (!resultadosClienteCache.length) {
      sel.innerHTML = '<option value="">Sin coincidencias…</option>';
      sel.style.display = 'block';
      return;
    }
    sel.innerHTML = `<option value="">— ${resultadosClienteCache.length} resultado(s), selecciona uno —</option>` +
      resultadosClienteCache.map((c, i) =>
        `<option value="${i}">${c.razonSocial}${c.nit ? ' — NIT ' + c.nit : ''}</option>`
      ).join('');
    sel.style.display = 'block';
  } catch (e) {
    toast('Error buscando clientes.', 'err');
  }
}

function elegirClienteDeResultados() {
  const sel = document.getElementById('selectResultadosCliente');
  if (sel.value === '') return;
  seleccionarCliente(resultadosClienteCache[parseInt(sel.value)]);
}

function seleccionarCliente(c) {
  clienteSeleccionado = c;
  document.getElementById('clienteNombre').textContent = c.razonSocial;
  document.getElementById('clienteNit').textContent    = c.nit ? `NIT: ${c.nit}` : 'Sin NIT registrado';
  document.getElementById('clienteBadge').style.display = 'flex';
  document.getElementById('buscarCliente').disabled = true;
  document.getElementById('selectResultadosCliente').style.display = 'none';
  toast(`Cliente encontrado: ${c.razonSocial}`, 'ok');
}

function limpiarBusquedaActual() {
  clienteSeleccionado = null;
  resultadosClienteCache = [];
  const inp = document.getElementById('buscarCliente');
  if (inp) { inp.value = ''; inp.disabled = false; inp.focus(); }
  const sel = document.getElementById('selectResultadosCliente');
  if (sel) { sel.style.display = 'none'; sel.innerHTML = '<option value="">— Resultados —</option>'; }
  document.getElementById('clienteBadge').style.display = 'none';
  document.getElementById('sectorActual').selectedIndex = 0;
}

// ── BÚSQUEDA CLIENTE PROFUNDIZACIÓN — mismo patrón ───────────────
function buscarClienteProfDebounce() {
  clearTimeout(debounceTimerProf);
  debounceTimerProf = setTimeout(buscarClienteProf, 350);
}

async function buscarClienteProf() {
  const q   = document.getElementById('buscarClienteProf').value.trim();
  const sel = document.getElementById('selectResultadosClienteProf');

  if (q.length < 3) {
    sel.style.display = 'none';
    sel.innerHTML = '<option value="">— Resultados —</option>';
    return;
  }
  try {
    const res = await fetch(`${API}/clientes/buscar?criterio=${encodeURIComponent(q)}`).then(r => r.json());
    resultadosClienteProfCache = res.data || [];
    if (!resultadosClienteProfCache.length) {
      sel.innerHTML = '<option value="">Sin coincidencias…</option>';
      sel.style.display = 'block';
      return;
    }
    sel.innerHTML = `<option value="">— ${resultadosClienteProfCache.length} resultado(s), selecciona uno —</option>` +
      resultadosClienteProfCache.map((c, i) =>
        `<option value="${i}">${c.razonSocial}${c.nit ? ' — NIT ' + c.nit : ''}</option>`
      ).join('');
    sel.style.display = 'block';
  } catch (e) {
    toast('Error buscando clientes.', 'err');
  }
}

function elegirClienteProfDeResultados() {
  const sel = document.getElementById('selectResultadosClienteProf');
  if (sel.value === '') return;
  seleccionarClienteProf(resultadosClienteProfCache[parseInt(sel.value)]);
}

function seleccionarClienteProf(c) {
  clienteProfSeleccionado = c;
  document.getElementById('clienteNombreProf').textContent = c.razonSocial;
  document.getElementById('clienteNitProf').textContent    = c.nit ? `NIT: ${c.nit}` : 'Sin NIT registrado';
  document.getElementById('clienteBadgeProf').style.display = 'flex';
  document.getElementById('buscarClienteProf').disabled = true;
  document.getElementById('selectResultadosClienteProf').style.display = 'none';
  toast(`Cliente encontrado: ${c.razonSocial}`, 'ok');
}

function limpiarBusquedaProf() {
  clienteProfSeleccionado = null;
  resultadosClienteProfCache = [];
  const inp = document.getElementById('buscarClienteProf');
  if (inp) { inp.value = ''; inp.disabled = false; inp.focus(); }
  const sel = document.getElementById('selectResultadosClienteProf');
  if (sel) { sel.style.display = 'none'; sel.innerHTML = '<option value="">— Resultados —</option>'; }
  document.getElementById('clienteBadgeProf').style.display = 'none';
  document.getElementById('sectorProfundizacion').selectedIndex = 0;
}

// ── SWEET ALERT HELPERS ───────────────────────────────────────────
const Toast = Swal.mixin({
  toast: true, position: 'bottom-end',
  showConfirmButton: false, timer: 3500, timerProgressBar: true,
  didOpen: (t) => {
    t.addEventListener('mouseenter', Swal.stopTimer);
    t.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

function toast(msg, tipo = 'ok') {
  Toast.fire({ icon: tipo === 'ok' ? 'success' : 'error', title: msg });
}

// [v5] Catálogo de modalidades con su tope de meses (MaxMeses viene de la BD:
//      CRM.ModalidadContrato.MaxMeses). El límite YA NO está escrito en el JS.
let catalogoModalidades = [];

// Tope de meses de la modalidad seleccionada. null = sin límite.
function maxMesesModalidad() {
  const sel = document.getElementById('idModalidad');
  const id  = parseInt(sel?.value) || 0;
  if (!id) return null;
  const m = catalogoModalidades.find(x => x.id === id);
  return (m && m.maxMeses) ? m.maxMeses : null;
}

// ── CARGAR CATÁLOGOS ──────────────────────────────────────────────
async function cargarCatalogos() {
  try {
    const [tiposCliente, sectores, consultores, servicios, modalidades, fases, municipios] = await Promise.all([
      fetch(`${API}/catalogos/tipos-cliente`).then(r => r.json()),
      fetch(`${API}/catalogos/sectores-economicos`).then(r => r.json()),
      fetch(`${API}/catalogos/consultores`).then(r => r.json()),
      fetch(`${API}/catalogos/servicios`).then(r => r.json()),
      fetch(`${API}/catalogos/modalidades`).then(r => r.json()),
      fetch(`${API}/catalogos/fases-venta`).then(r => r.json()),
      fetch(`${API}/catalogos/municipios`).then(r => r.json()),
    ]);

    llenarSelect('sectorNuevo',          sectores.data, 'id', 'descripcion');
    llenarSelect('sectorActual',         sectores.data, 'id', 'descripcion');
    llenarSelect('sectorProfundizacion', sectores.data, 'id', 'descripcion');

    llenarSelect('idConsultor', consultores.data, 'id', 'descripcion');
    llenarSelect('idServicio',  servicios.data,   'id', 'descripcion');
    catalogoModalidades = modalidades.data || [];
    llenarSelect('idModalidad', modalidades.data, 'id', 'descripcion');

    const fasesFiltradas = (fases.data || []).filter(f =>
      !FASES_EXCLUIDAS.includes(normalizarTexto(f.descripcion))
    );
    llenarSelect('idFaseVenta', fasesFiltradas, 'id', 'descripcion');

    todosLosMunicipios = municipios.data;

    const consSelect = document.getElementById('idConsultor');
    for (const opt of consSelect.options) {
      if (normalizarTexto(opt.text) === normalizarTexto(usuario)) {
        consSelect.value = opt.value; break;
      }
    }
    consSelect.disabled = true;

    const fechaEl = document.getElementById('fecha');
    fechaEl.valueAsDate = new Date();
    fechaEl.readOnly    = true;

    document.getElementById('idModalidad').addEventListener('change', aplicarLimiteMeses);

  } catch (e) {
    toast('Error cargando catálogos. Verifica que la API esté activa.', 'err');
  }
}

// ── LIMITAR MESES SEGÚN MODALIDAD ────────────────────────────────
function aplicarLimiteMeses() {
  const sel      = document.getElementById('idModalidad');
  const descMod  = sel.options[sel.selectedIndex]?.text || '';
  const tope     = maxMesesModalidad();      // null = sin límite
  const maxMes   = tope || 72;               // 72 = tope técnico del formulario
  const input    = document.getElementById('tiempoMeses');
  input.max      = maxMes;

  const actual = parseInt(input.value) || 0;
  if (actual > maxMes) {
    input.value = maxMes;
    calcularAIU();
    calcularFechaFinServicio();
    calcularMesFinServicio();
    toast(`Modalidad ${descMod.trim()}: máximo ${maxMes} meses permitidos.`, 'err');
  }

  const hint = document.querySelector('#tiempoMeses + .hint');
  if (hint) {
    hint.innerHTML = `<i class="bi bi-info-circle me-1"></i>Máximo ${maxMes} meses` +
                     (tope ? ` (modalidad ${descMod.trim()})` : '');
  }
}

function llenarSelect(id, items, valKey, txtKey) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Seleccionar —</option>';
  (items || []).forEach(i => {
    const opt = document.createElement('option');
    opt.value = i[valKey]; opt.textContent = i[txtKey];
    sel.appendChild(opt);
  });
}

// ── FILTRO MUNICIPIO ──────────────────────────────────────────────
function filtrarMunicipios() {
  const q   = document.getElementById('buscarMunicipio').value.toLowerCase();
  const sel = document.getElementById('idMunicipio');
  sel.innerHTML = '<option value="">— Seleccionar —</option>';
  todosLosMunicipios
    .filter(m => m.nombre.toLowerCase().includes(q) || m.departamento.toLowerCase().includes(q))
    .slice(0, 80)
    .forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.idMunicipio;
      opt.textContent = `${m.nombre} — ${m.departamento}`;
      sel.appendChild(opt);
    });
}

// ── FORMATO DE MONEDA ─────────────────────────────────────────────
function parseMoney(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/,/g, '')) || 0;
}

function formatMoney(value) {
  const n = Math.round(Math.abs(parseMoney(String(value))));
  if (isNaN(n) || n === 0) return '';
  return n.toLocaleString('en-US');
}

const MAX_VALOR = 99999999999;

function onMoneyInput(el) {
  let raw = parseMoney(el.value);
  if (raw > MAX_VALOR) {
    raw = MAX_VALOR;
    toast('El valor máximo permitido es $99,999,999,999', 'err');
  }
  el.value = raw > 0 ? formatMoney(raw) : '';
  calcularAIU();
}

// ── CÁLCULO AIU ───────────────────────────────────────────────────
function calcularAIU() {
  const vm    = parseMoney(document.getElementById('valorMensual').value);
  const c     = parseMoney(document.getElementById('costo').value);
  const meses = parseInt(document.getElementById('tiempoMeses').value) || 0;

  const aiu    = vm - c;
  const pctAIU = vm > 0 ? (aiu / vm * 100) : 0;
  const total  = vm * meses;

  document.getElementById('aiuAbs').textContent     = formatCOP(aiu);
  document.getElementById('aiuPct').textContent     = pctAIU.toFixed(2) + '%';
  document.getElementById('montoTotal').textContent = formatCOP(total);
}

function formatCOP(v) {
  return '$' + Math.round(Math.abs(v)).toLocaleString('en-US');
}

// ── CALCULAR FECHA FIN SERVICIO ───────────────────────────────────
function calcularFechaFinServicio() {
  const fechaInicio = document.getElementById('fechaInicioServicio').value;
  const meses       = parseInt(document.getElementById('tiempoMeses').value) || 0;
  const finEl       = document.getElementById('fechaFinServicio');

  if (!fechaInicio || meses <= 0) { finEl.value = ''; return; }

  const [y, m, d] = fechaInicio.split('-').map(Number);
  const fechaFin  = new Date(y, m - 1 + meses, d - 1);
  const yy  = fechaFin.getFullYear();
  const mm  = String(fechaFin.getMonth() + 1).padStart(2, '0');
  const dd  = String(fechaFin.getDate()).padStart(2, '0');
  finEl.value = `${yy}-${mm}-${dd}`;
}

// ── CALCULAR MES FIN SERVICIO ─────────────────────────────────────
function calcularMesFinServicio() {
  const mesInicioVal = parseInt(document.getElementById('mesInicioServicio').value);
  const meses        = parseInt(document.getElementById('tiempoMeses').value) || 0;
  const mesFinEl     = document.getElementById('mesFinServicio');

  if (!mesInicioVal || meses <= 0) { mesFinEl.value = ''; return; }

  const idxFin = ((mesInicioVal - 1) + (meses - 1)) % 12;
  mesFinEl.value = NOMBRES_MESES[idxFin];
}

// Listeners de tiempo meses / fechas
document.getElementById('fechaInicioServicio').addEventListener('change', function() {
  calcularFechaFinServicio();
  const mesS = parseInt(document.getElementById('mesInicioServicio').value);
  if (mesS && this.value) {
    const mesR = new Date(this.value + 'T00:00:00').getMonth() + 1;
    if (mesR === mesS) this.classList.remove('error');
  }
});

document.getElementById('mesInicioServicio').addEventListener('change', function() {
  calcularMesFinServicio();
  const fechaEl = document.getElementById('fechaInicioServicio');
  if (fechaEl.value) {
    const mesR = new Date(fechaEl.value + 'T00:00:00').getMonth() + 1;
    const mesS = parseInt(this.value);
    if (mesS && mesR !== mesS) {
      fechaEl.classList.add('error');
    } else {
      fechaEl.classList.remove('error');
    }
  }
});

document.getElementById('tiempoMeses').addEventListener('input', function () {
  const maxMes = maxMesesModalidad() || 72;   // [v5] tope leído del catálogo

  if (parseInt(this.value) > maxMes) {
    this.value = maxMes;
    toast(`Máximo ${maxMes} meses para esta modalidad.`, 'err');
  }
  if (parseInt(this.value) < 1 && this.value !== '') this.value = 1;

  calcularAIU();
  calcularFechaFinServicio();
  calcularMesFinServicio();
});

// ── GUARDAR ───────────────────────────────────────────────────────
async function guardarOportunidad() {
  if (!modoCliente) {
    toast('Selecciona el tipo de cliente antes de continuar.', 'err');
    return;
  }

  const grupo = obtenerGrupoFase();
  if (!grupo) {
    toast('Selecciona la fase de la oportunidad.', 'err');
    return;
  }
  const esContacto   = grupo === 'contacto';
  const esCotizacion = grupo === 'cotizacion';

  let nit, razonSocial, idTipoCliente, idSectorEconomico;

  // ── MODO NUEVO ──
  if (modoCliente === 'nuevo') {
    nit               = document.getElementById('nitNuevo').value.trim() || null;
    razonSocial       = document.getElementById('razonSocialNuevo').value.trim().toUpperCase();
    idSectorEconomico = parseInt(document.getElementById('sectorNuevo').value);
    idTipoCliente     = await resolverIdTipo('NUEVO');

    if (!razonSocial)       { toast('La Razón Social es obligatoria.', 'err'); return; }
    if (!idSectorEconomico) { toast('Selecciona el Sector Económico.', 'err'); return; }

    const yaExiste = await verificarClienteExistente(nit, razonSocial);
    if (yaExiste) {
      const confirm = await Swal.fire({
        icon: 'warning',
        title: '¡Cliente ya registrado!',
        html: `El cliente <strong>${razonSocial}</strong> ya existe en el sistema.<br><br>
               ¿Estás seguro de registrarlo como <strong>CLIENTE NUEVO</strong>?<br>
               <small style="color:#8896B0">Esta acción está permitida por política de la empresa, pero verifica que aplique.</small>`,
        showCancelButton: true,
        confirmButtonColor: '#D93025',
        cancelButtonColor:  '#003087',
        confirmButtonText:  'Sí, registrar como Nuevo',
        cancelButtonText:   'Cancelar — usar modo Actual',
        reverseButtons: true,
      });
      if (!confirm.isConfirmed) return;
    }

  // ── MODO ACTUAL ──
  } else if (modoCliente === 'actual') {
    if (!clienteSeleccionado) { toast('Busca y selecciona un cliente existente.', 'err'); return; }
    nit               = clienteSeleccionado.nit || null;
    razonSocial       = clienteSeleccionado.razonSocial;
    idSectorEconomico = parseInt(document.getElementById('sectorActual').value);
    idTipoCliente     = await resolverIdTipo('ACTUAL');

    if (!idSectorEconomico) { toast('Selecciona el Sector Económico.', 'err'); return; }

  // ── MODO PROFUNDIZACIÓN ──
  } else if (modoCliente === 'profundizacion') {
    if (!clienteProfSeleccionado) { toast('Busca y selecciona el cliente a profundizar.', 'err'); return; }
    nit               = clienteProfSeleccionado.nit || null;
    razonSocial       = clienteProfSeleccionado.razonSocial;
    idSectorEconomico = parseInt(document.getElementById('sectorProfundizacion').value);
    idTipoCliente     = await resolverIdTipo('PROFUNDIZACION');

    if (!idSectorEconomico) { toast('Selecciona el Sector Económico.', 'err'); return; }
  }

  // Observación obligatoria (siempre)
  const obsEl = document.getElementById('observacion');
  if (!obsEl.value.trim()) {
    obsEl.classList.add('error');
    toast('La observación es obligatoria.', 'err');
    return;
  }
  obsEl.classList.remove('error');

  // Campos obligatorios siempre
  const reqsBase = ['idServicio', 'idMunicipio', 'idConsultor', 'idFaseVenta', 'fecha'];
  // Campos obligatorios solo fuera del grupo "contacto"
  const reqsCompletos = ['idModalidad', 'tiempoMeses'];

  let ok = true;
  reqsBase.forEach(id => {
    const el = document.getElementById(id);
    if (!el || !el.value) { el?.classList.add('error'); ok = false; }
    else el.classList.remove('error');
  });
  if (!esContacto) {
    reqsCompletos.forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.value) { el?.classList.add('error'); ok = false; }
      else el.classList.remove('error');
    });
  }
  if (!ok) { toast('Completa todos los campos obligatorios (✦)', 'err'); return; }

  // N° Cotización obligatorio solo en el grupo "cotizacion"
  if (esCotizacion) {
    const cotEl = document.getElementById('numeroCotizacion');
    if (!cotEl.value.trim()) {
      cotEl.classList.add('error');
      toast('El N° de Cotización es obligatorio en esta fase.', 'err');
      return;
    }
    cotEl.classList.remove('error');
  }

  // Validar que la Fecha Inicio corresponda al Mes Inicio (solo si son visibles)
  if (!esContacto) {
    const mesInicioSel = parseInt(document.getElementById('mesInicioServicio').value);
    const fechaIniVal  = document.getElementById('fechaInicioServicio').value;
    if (mesInicioSel && fechaIniVal) {
      const mesReal = new Date(fechaIniVal + 'T00:00:00').getMonth() + 1;
      if (mesReal !== mesInicioSel) {
        document.getElementById('fechaInicioServicio').classList.add('error');
        toast(`La Fecha de Inicio (${NOMBRES_MESES[mesReal-1]}) no corresponde al Mes de Inicio (${NOMBRES_MESES[mesInicioSel-1]}).`, 'err');
        return;
      }
      document.getElementById('fechaInicioServicio').classList.remove('error');
    }
  }

  const vm = esContacto ? 0 : parseMoney(document.getElementById('valorMensual').value);
  const c  = esContacto ? 0 : parseMoney(document.getElementById('costo').value);

  if (!esContacto) {
    const permiteValorCero = fasePermiteValorCero();

    if (!permiteValorCero) {
      const vmEl = document.getElementById('valorMensual');
      const cEl  = document.getElementById('costo');

      if (vm <= 0) {
        vmEl.classList.add('error');
        toast('El Valor Mensual debe ser mayor a $0 para esta fase.', 'err');
        return;
      }
      vmEl.classList.remove('error');

      if (c <= 0) {
        cEl.classList.add('error');
        toast('El Costo debe ser mayor a $0 para esta fase.', 'err');
        return;
      }
      cEl.classList.remove('error');
    }

    if (vm > 0 && c >= vm) {
      toast('El Costo no puede ser igual o mayor al Valor Mensual (AIU debe ser > 0%).', 'err');
      document.getElementById('costo').classList.add('error');
      return;
    }
    document.getElementById('costo').classList.remove('error');
  }

  const btn = document.getElementById('btnGuardar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Guardando...';

  const telNuevo    = modoCliente === 'nuevo' ? (document.getElementById('telNuevo').value.trim()    || null) : null;
  const correoNuevo = modoCliente === 'nuevo' ? (document.getElementById('correoNuevo').value.trim() || null) : null;

  const mesInicioVal = esContacto ? null : (parseInt(document.getElementById('mesInicioServicio').value) || null);

  const body = {
    nit,
    razonSocial,
    idTipoCliente,
    idSectorEconomico,
    telefono:            telNuevo,
    correo:              correoNuevo,
    numeroCotizacion:    document.getElementById('numeroCotizacion').value.toUpperCase().trim(),
    idConsultor:         parseInt(document.getElementById('idConsultor').value),
    idMunicipio:         parseInt(document.getElementById('idMunicipio').value),
    idServicio:          parseInt(document.getElementById('idServicio').value),
    idModalidad:         esContacto ? null : (parseInt(document.getElementById('idModalidad').value) || null),
    esLicitacion:        esContacto ? false : (document.getElementById('esLicitacion').value === 'true'),
    tiempoMeses:         esContacto ? null : (parseInt(document.getElementById('tiempoMeses').value) || null),
    idMesInicio:         mesInicioVal,
    fechaInicioServicio: esContacto ? null : (document.getElementById('fechaInicioServicio').value || null),
    fechaFinServicio:    esContacto ? null : (document.getElementById('fechaFinServicio').value    || null),
    fecha:               document.getElementById('fecha').value,
    idFaseVenta:         parseInt(document.getElementById('idFaseVenta').value),
    valorMensual:        vm,
    costo:               c,
    observacion:         document.getElementById('observacion').value || null,
  };

  try {
    const res  = await fetch(`${API}/oportunidades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const cotLabel = data.data.numeroCotizacion
        ? `Cotización <strong>${data.data.numeroCotizacion}</strong>`
        : `Oportunidad <strong>#${data.data.idOportunidad}</strong>`;
      const result = await Swal.fire({
        icon: 'success',
        title: '¡Oportunidad Creada!',
        html: `${cotLabel} fue registrada exitosamente.`,
        showCancelButton:   true,
        confirmButtonColor: '#39B54A',
        cancelButtonColor:  '#003087',
        confirmButtonText:  '<i class="bi bi-eye me-1"></i>Ver Detalle',
        cancelButtonText:   '<i class="bi bi-plus-circle me-1"></i>Registrar Otra',
      });
      if (result.isConfirmed) {
        if (data.data.numeroCotizacion) {
          sessionStorage.setItem('crm_cotizacion_activa', data.data.numeroCotizacion);
        }
        window.location.href = 'actualizar-oportunidad.html';
      } else {
        limpiarFormulario();
      }
    } else {
      toast(data.message || 'Error al guardar la oportunidad.', 'err');
    }
  } catch (e) {
    toast('Error de conexión con la API.', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Registrar Oportunidad';
  }
}

// ── RESOLVER ID TIPO CLIENTE ──────────────────────────────────────
let _cacheTipos = null;
async function resolverIdTipo(descripcion) {
  if (!_cacheTipos) {
    const r = await fetch(`${API}/catalogos/tipos-cliente`).then(x => x.json());
    _cacheTipos = r.data || [];
  }
  const found = _cacheTipos.find(t =>
    normalizarTexto(t.descripcion) === normalizarTexto(descripcion)
  );
  return found ? found.id : 1;
}

// ── LIMPIAR FORMULARIO (vuelve al Paso 1) ─────────────────────────
function limpiarFormulario() {
  modoCliente              = null;
  clienteSeleccionado      = null;
  clienteProfSeleccionado  = null;

  document.getElementById('btnNuevo').className           = 'btn-tipo';
  document.getElementById('btnActual').className          = 'btn-tipo';
  document.getElementById('btnProfundizacion').className  = 'btn-tipo';

  document.getElementById('cardCliente').style.display     = 'none';
  document.getElementById('cardFase').style.display        = 'none';
  document.getElementById('restoFormulario').style.display = 'none';
  document.getElementById('resumenCliente').style.display  = 'none';
  document.getElementById('stepTipo').style.display        = 'block';

  document.getElementById('panelNuevo').style.display    = 'none';
  document.getElementById('panelActual').style.display   = 'none';
  document.getElementById('panelProfundizacion').style.display = 'none';

  document.getElementById('idFaseVenta').selectedIndex = 0;

  // Campos de texto / número
  ['numeroCotizacion','tiempoMeses','fechaInicioServicio','fechaFinServicio',
   'valorMensual','costo','observacion','telNuevo','correoNuevo',
   'nitNuevo','razonSocialNuevo','mesFinServicio'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });

  // Selects
  ['idServicio','idModalidad','mesInicioServicio',
   'sectorNuevo','sectorActual','sectorProfundizacion'].forEach(id => {
    const el = document.getElementById(id); if (el) el.selectedIndex = 0;
  });
  document.getElementById('esLicitacion').value = 'false';

  limpiarBusquedaActual();
  limpiarBusquedaProf();

  const fechaEl = document.getElementById('fecha');
  fechaEl.valueAsDate = new Date();
  fechaEl.readOnly    = true;

  aplicarLimiteMeses();   // [v5] restablece el tope segun la modalidad activa

  calcularAIU();
  marcarPaso(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── VERIFICAR CLIENTE EXISTENTE ───────────────────────────────────
async function verificarClienteExistente(nit, razonSocial) {
  try {
    const params = new URLSearchParams();
    if (nit)         params.append('nit', nit);
    if (razonSocial) params.append('razonSocial', razonSocial);
    const res = await fetch(`${API}/clientes/verificar?${params}`).then(r => r.json());
    return res?.data?.existe === true;
  } catch { return false; }
}

function verPipeline() {
  window.location.href = 'pipeline.html';
}

// ── INICIALIZAR ───────────────────────────────────────────────────
cargarCatalogos();
