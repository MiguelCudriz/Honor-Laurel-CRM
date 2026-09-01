/* ================================================================
   logicanueva.js — CRM Honor · Nueva Oportunidad Comercial
   ================================================================ */

const API = 'http://localhost:5000/api';
let todosLosClientes    = [];
let todosLosMunicipios  = [];
let modoCliente         = null;
let clienteSeleccionado = null;
let clienteProfSeleccionado = null;
let debounceTimer       = null;
let debounceTimerProf   = null;

// ── AUTH ─────────────────────────────────────────────────────────
const usuario = sessionStorage.getItem('crm_usuario');
if (!usuario) window.location.href = 'index.html';
document.getElementById('navUsuario').textContent = usuario;

const rol = sessionStorage.getItem('crm_rol');
if (rol && rol.toUpperCase() === 'ADMIN') {
  ['navLinkAdmin','sidebarAdminDivider','sidebarAdminLabel','sidebarAdminItem',
   'sidebarPipelineDivider','sidebarPipelineLabel','sidebarPipelineItem'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
}

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
const FASES_EXCLUIDAS = ['NO PRESENTADO', 'NO ADJUDICADO', 'PASO DE MES'];

// ── FASES QUE PERMITEN VALORES EN $0 ─────────────────────────────
// Alineado con la BD: ids 4,5,6,7,8 permiten cero
// (CONTACTO E-MAIL, CONTACTO TELEFONICO, INSCRIPCION PROVEEDOR,
//  VISITA A CLIENTE, LICITACION ABIERTA)
const FASES_PERMITEN_CERO = [
  'CONTACTO E-MAIL',
  'CONTACTO EMAIL',
  'CONTACTO TELEFONICO',
  'INSCRIPCION PROVEEDOR',
  'VISITA A CLIENTE',
  'LICITACION ABIERTA',
];

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

// ── SELECTOR MODO CLIENTE ─────────────────────────────────────────
function seleccionarModo(modo) {
  modoCliente = modo;

  // Resetear clases de los 3 botones
  document.getElementById('btnNuevo').className        = 'btn-tipo' + (modo === 'nuevo'         ? ' activo-nuevo'         : '');
  document.getElementById('btnActual').className       = 'btn-tipo' + (modo === 'actual'        ? ' activo-actual'        : '');
  document.getElementById('btnProfundizacion').className = 'btn-tipo' + (modo === 'profundizacion' ? ' activo-profundizacion' : '');

  const card = document.getElementById('cardCliente');
  card.style.display = 'block';
  card.style.animation = 'none';
  requestAnimationFrame(() => { card.style.animation = ''; });

  // Ocultar todos los paneles primero
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
    // Limpiar campos
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
}

// ── BÚSQUEDA CLIENTE ACTUAL ───────────────────────────────────────
function buscarClienteDebounce() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(buscarCliente, 380);
}

async function buscarCliente() {
  const q = document.getElementById('buscarCliente').value.trim();
  if (q.length < 3) return;
  try {
    const res = await fetch(`${API}/clientes/buscar?criterio=${encodeURIComponent(q)}`).then(r => r.json());
    if (res.data && res.data.length > 0) seleccionarCliente(res.data[0]);
  } catch (e) {}
}

function seleccionarCliente(c) {
  clienteSeleccionado = c;
  document.getElementById('clienteNombre').textContent = c.razonSocial;
  document.getElementById('clienteNit').textContent    = c.nit ? `NIT: ${c.nit}` : 'Sin NIT registrado';
  document.getElementById('clienteBadge').style.display = 'flex';
  document.getElementById('buscarCliente').disabled = true;
  toast(`Cliente encontrado: ${c.razonSocial}`, 'ok');
}

function limpiarBusquedaActual() {
  clienteSeleccionado = null;
  const inp = document.getElementById('buscarCliente');
  if (inp) { inp.value = ''; inp.disabled = false; inp.focus(); }
  document.getElementById('clienteBadge').style.display = 'none';
  document.getElementById('sectorActual').selectedIndex = 0;
}

// ── BÚSQUEDA CLIENTE PROFUNDIZACIÓN ──────────────────────────────
function buscarClienteProfDebounce() {
  clearTimeout(debounceTimerProf);
  debounceTimerProf = setTimeout(buscarClienteProf, 380);
}

async function buscarClienteProf() {
  const q = document.getElementById('buscarClienteProf').value.trim();
  if (q.length < 3) return;
  try {
    const res = await fetch(`${API}/clientes/buscar?criterio=${encodeURIComponent(q)}`).then(r => r.json());
    if (res.data && res.data.length > 0) seleccionarClienteProf(res.data[0]);
  } catch (e) {}
}

function seleccionarClienteProf(c) {
  clienteProfSeleccionado = c;
  document.getElementById('clienteNombreProf').textContent = c.razonSocial;
  document.getElementById('clienteNitProf').textContent    = c.nit ? `NIT: ${c.nit}` : 'Sin NIT registrado';
  document.getElementById('clienteBadgeProf').style.display = 'flex';
  document.getElementById('buscarClienteProf').disabled = true;
  toast(`Cliente encontrado: ${c.razonSocial}`, 'ok');
}

function limpiarBusquedaProf() {
  clienteProfSeleccionado = null;
  const inp = document.getElementById('buscarClienteProf');
  if (inp) { inp.value = ''; inp.disabled = false; inp.focus(); }
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

    // Poblar sectores en los 3 paneles
    llenarSelect('sectorNuevo',          sectores.data, 'id', 'descripcion');
    llenarSelect('sectorActual',         sectores.data, 'id', 'descripcion');
    llenarSelect('sectorProfundizacion', sectores.data, 'id', 'descripcion');

    llenarSelect('idConsultor', consultores.data, 'id', 'descripcion');
    llenarSelect('idServicio',  servicios.data,   'id', 'descripcion');
    llenarSelect('idModalidad', modalidades.data, 'id', 'descripcion');

    // Filtrar fases excluidas (usando normalización para comparación segura)
    const fasesFiltradas = (fases.data || []).filter(f =>
      !FASES_EXCLUIDAS.includes(normalizarTexto(f.descripcion))
    );
    llenarSelect('idFaseVenta', fasesFiltradas, 'id', 'descripcion');

    todosLosMunicipios = municipios.data;

    // Bloquear consultor al usuario en sesión
    const consSelect = document.getElementById('idConsultor');
    for (const opt of consSelect.options) {
      if (normalizarTexto(opt.text) === normalizarTexto(usuario)) {
        consSelect.value = opt.value; break;
      }
    }
    consSelect.disabled = true;

    // Fecha automática bloqueada
    const fechaEl = document.getElementById('fecha');
    fechaEl.valueAsDate = new Date();
    fechaEl.readOnly    = true;

    // Listener modalidad → limitar meses
    document.getElementById('idModalidad').addEventListener('change', aplicarLimiteMeses);

  } catch (e) {
    toast('Error cargando catálogos. Verifica que la API esté activa.', 'err');
  }
}

// ── LIMITAR MESES SEGÚN MODALIDAD ────────────────────────────────
function aplicarLimiteMeses() {
  const sel    = document.getElementById('idModalidad');
  const desc   = normalizarTexto(sel.options[sel.selectedIndex]?.text || '');
  const esOcas = desc.includes('OCASIONAL');
  const maxMes = esOcas ? 1 : 72;
  const input  = document.getElementById('tiempoMeses');
  input.max    = maxMes;

  const actual = parseInt(input.value) || 0;
  if (actual > maxMes) {
    input.value = maxMes;
    calcularAIU();
    calcularFechaFinServicio();
    calcularMesFinServicio();
    toast(`Modalidad OCASIONAL: máximo ${maxMes} meses permitidos.`, 'err');
  }

  const hint = document.querySelector('#tiempoMeses + .hint');
  if (hint) {
    hint.innerHTML = `<i class="bi bi-info-circle me-1"></i>Máximo ${maxMes} meses${esOcas ? ' (modalidad Ocasional)' : ''}`;
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
// Regla: fechaFin = fechaInicio + tiempoMeses meses − 1 día
// Ejemplo: 15/04/2026 + 3 meses → 14/07/2026
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
// Regla: mesFin = mesInicio + tiempoMeses − 1 (base 1-12, con wrap anual)
// Ejemplo: Enero(1) + 3 meses = Marzo(3)  ← el contrato cubre Ene, Feb, Mar
// Ejemplo: Noviembre(11) + 3 meses = Enero(1) del siguiente año
function calcularMesFinServicio() {
  const mesInicioVal = parseInt(document.getElementById('mesInicioServicio').value);
  const meses        = parseInt(document.getElementById('tiempoMeses').value) || 0;
  const mesFinEl     = document.getElementById('mesFinServicio');

  if (!mesInicioVal || meses <= 0) { mesFinEl.value = ''; return; }

  // (mesInicio - 1) + (meses - 1)  con módulo 12, resultado base 0
  const idxFin = ((mesInicioVal - 1) + (meses - 1)) % 12;
  mesFinEl.value = NOMBRES_MESES[idxFin];
}

// Listeners de tiempo meses
document.getElementById('fechaInicioServicio').addEventListener('change', function() {
  calcularFechaFinServicio();
  // Limpiar error si el mes ahora coincide
  const mesS = parseInt(document.getElementById('mesInicioServicio').value);
  if (mesS && this.value) {
    const mesR = new Date(this.value + 'T00:00:00').getMonth() + 1;
    if (mesR === mesS) this.classList.remove('error');
  }
});

// Sincronizar mes de inicio cuando cambia la fecha de inicio
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
  const sel    = document.getElementById('idModalidad');
  const desc   = normalizarTexto(sel.options[sel.selectedIndex]?.text || '');
  const maxMes = desc.includes('OCASIONAL') ? 1 : 72;

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

  // Observación obligatoria
  const obsEl = document.getElementById('observacion');
  if (!obsEl.value.trim()) {
    obsEl.classList.add('error');
    toast('La observación del primer movimiento es obligatoria.', 'err');
    return;
  }
  obsEl.classList.remove('error');

  // Campos obligatorios
  const reqs = ['idServicio','idModalidad','tiempoMeses','idMunicipio','idConsultor','idFaseVenta','fecha'];
  let ok = true;
  reqs.forEach(id => {
    const el = document.getElementById(id);
    if (!el || !el.value) { el?.classList.add('error'); ok = false; }
    else el.classList.remove('error');
  });
  if (!ok) { toast('Completa todos los campos obligatorios (✦)', 'err'); return; }

  // Validar que la Fecha Inicio corresponda al Mes Inicio seleccionado
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

  const vm = parseMoney(document.getElementById('valorMensual').value);
  const c  = parseMoney(document.getElementById('costo').value);

  // Validación de valores según fase
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

  // Costo no puede ser >= Valor Mensual
  if (vm > 0 && c >= vm) {
    toast('El Costo no puede ser igual o mayor al Valor Mensual (AIU debe ser > 0%).', 'err');
    document.getElementById('costo').classList.add('error');
    return;
  }
  document.getElementById('costo').classList.remove('error');

  const btn = document.getElementById('btnGuardar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Guardando...';

  // Datos extras opcionales (solo aplican según modo)
  const telNuevo    = modoCliente === 'nuevo' ? (document.getElementById('telNuevo').value.trim()    || null) : null;
  const correoNuevo = modoCliente === 'nuevo' ? (document.getElementById('correoNuevo').value.trim() || null) : null;

  // Mes inicio/fin
  const mesInicioVal = parseInt(document.getElementById('mesInicioServicio').value) || null;
  // mesFinServicio no se envía al backend: la BD lo calcula automáticamente
  // a partir de IdMesInicio + TiempoMeses mediante SP_CrearOportunidad

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
    idModalidad:         parseInt(document.getElementById('idModalidad').value),
    esLicitacion:        document.getElementById('esLicitacion').value === 'true',
    tiempoMeses:         parseInt(document.getElementById('tiempoMeses').value),
    idMesInicio:         mesInicioVal,   // mapea a IdMesInicio en el DTO del backend
    fechaInicioServicio: document.getElementById('fechaInicioServicio').value || null,
    fechaFinServicio:    document.getElementById('fechaFinServicio').value    || null,
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

// ── LIMPIAR FORMULARIO ────────────────────────────────────────────
function limpiarFormulario() {
  modoCliente              = null;
  clienteSeleccionado      = null;
  clienteProfSeleccionado  = null;

  document.getElementById('btnNuevo').className           = 'btn-tipo';
  document.getElementById('btnActual').className          = 'btn-tipo';
  document.getElementById('btnProfundizacion').className  = 'btn-tipo';
  document.getElementById('cardCliente').style.display   = 'none';
  document.getElementById('panelNuevo').style.display    = 'none';
  document.getElementById('panelActual').style.display   = 'none';
  document.getElementById('panelProfundizacion').style.display = 'none';

  // Campos de texto / número
  ['numeroCotizacion','tiempoMeses','fechaInicioServicio','fechaFinServicio',
   'valorMensual','costo','observacion','telNuevo','correoNuevo',
   'nitNuevo','razonSocialNuevo','mesFinServicio'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });

  // Selects
  ['idServicio','idModalidad','idFaseVenta','mesInicioServicio',
   'sectorNuevo','sectorActual','sectorProfundizacion'].forEach(id => {
    const el = document.getElementById(id); if (el) el.selectedIndex = 0;
  });
  document.getElementById('esLicitacion').value = 'false';

  // Búsquedas de clientes
  limpiarBusquedaActual();
  limpiarBusquedaProf();

  // Restaurar fecha automática
  const fechaEl = document.getElementById('fecha');
  fechaEl.valueAsDate = new Date();
  fechaEl.readOnly    = true;

  // Restaurar hint tiempo meses
  const hint = document.querySelector('#tiempoMeses + .hint');
  if (hint) hint.innerHTML = '<i class="bi bi-info-circle me-1"></i>Máximo 72 meses';
  document.getElementById('tiempoMeses').max = 72;

  calcularAIU();
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
