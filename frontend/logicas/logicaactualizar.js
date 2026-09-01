/* ================================================================
   logicaactualizar.js — CRM Honor · Consultar / Actualizar
   ================================================================ */

const API = 'http://localhost:5000/api';
let cotizacionActiva      = null;
let idOportunidadActiva   = null;
let tiempoMesesActiva      = 0;
let catalogoFases          = [];
let ordenFaseActiva        = 0;   // OrdenFunnel de la fase vigente
let idFaseActiva           = 0;   // IdFaseVenta vigente
let catalogoConsultores   = [];
let todasLasOportunidades = [];   // dataset completo para filtrar en grilla
let todosLosServicios     = [];   // para el selector de servicio en actualizar
let todosLosMunicipios    = [];   // para el filtro de municipio en actualizar

const NOMBRES_MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

// ── AUTH ──────────────────────────────────────────────────────────
const usuario = sessionStorage.getItem('crm_usuario');
if (!usuario) window.location.href = 'index.html';
document.getElementById('navUsuario').textContent = usuario;

const rol = (sessionStorage.getItem('crm_rol') || '').toUpperCase();
const esAdmin      = rol === 'ADMIN';
const esSupervisor = rol === 'SUPERVISOR';
const verTodos     = esAdmin || esSupervisor;

if (esAdmin) {
  ['navLinkAdmin','sidebarAdminDivider','sidebarAdminLabel','sidebarAdminItem',
   'sidebarPipelineDivider','sidebarPipelineLabel','sidebarPipelineItem'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = '';
  });
}

// Ocultar columna Consultor para CONSULTOR normal
if (!verTodos) {
  document.querySelectorAll('.col-consultor').forEach(el => el.style.display = 'none');
}

function verPipeline() { window.location.href = 'pipeline.html'; }
function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

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

// ── HELPERS ───────────────────────────────────────────────────────
function formatCOP(v) {
  return '$' + Math.round(Math.abs(parseFloat(v) || 0)).toLocaleString('en-US');
}
const MAX_VALOR = 99999999999;
function parseMoney(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/,/g, '')) || 0;
}
function formatMoney(value) {
  const n = Math.round(Math.abs(parseMoney(String(value))));
  return (isNaN(n) || n === 0) ? '' : n.toLocaleString('en-US');
}
function onMoneyInput(el) {
  let raw = parseMoney(el.value);
  if (raw > MAX_VALOR) { raw = MAX_VALOR; toast('El valor máximo permitido es $99,999,999,999', 'err'); }
  el.value = raw > 0 ? formatMoney(raw) : '';
  calcularAIU2();
}
function fmtFecha(f) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function normalizarTexto(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}
function resolveField(obj, ...keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

// ── HELPER PARA HISTORIAL (objetos dynamic de Dapper) ───────────────────────
// Dapper retorna columnas con el nombre exacto de SQL (PascalCase).
// System.Text.Json los serializa tal cual en objetos dynamic (no aplica camelCase).
// Esta función intenta clave exacta, camelCase y PascalCase para máxima compatibilidad.
function resolveHistField(m, ...keys) {
  for (const key of keys) {
    const camel  = key.charAt(0).toLowerCase() + key.slice(1);
    const pascal = key.charAt(0).toUpperCase() + key.slice(1);
    for (const k of [key, camel, pascal]) {
      const v = m[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
  }
  return undefined;
}

// ── FASES QUE PERMITEN $0 ─────────────────────────────────────────
// Alineado con BD: ids 3-8
const FASES_PERMITEN_CERO = [
  'CONTACTO E-MAIL',
  'CONTACTO EMAIL',
  'CONTACTO TELEFONICO',
  'INSCRIPCION PROVEEDOR',
  'VISITA A CLIENTE',
  'LICITACION ABIERTA',
  'PASO DE MES',
];

function fasePermiteValorCero() {
  const sel  = document.getElementById('upFaseVenta');
  const desc = normalizarTexto(sel.options[sel.selectedIndex]?.text || '');
  return FASES_PERMITEN_CERO.some(f => {
    const fn = normalizarTexto(f);
    return desc === fn || desc.includes(fn);
  });
}

// ── LLENAR SELECT ─────────────────────────────────────────────────
function llenarSelect(id, items, valKey, txtKey) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Seleccionar —</option>';
  (items || []).forEach(i => {
    const o = document.createElement('option');
    o.value = i[valKey]; o.textContent = i[txtKey];
    sel.appendChild(o);
  });
}

// ── CARGAR CATÁLOGOS ──────────────────────────────────────────────
async function cargarCatalogos() {
  try {
    const [fases, consultores, servicios, municipios] = await Promise.all([
      fetch(`${API}/catalogos/fases-venta`).then(r => r.json()),
      fetch(`${API}/catalogos/consultores`).then(r => r.json()),
      fetch(`${API}/catalogos/servicios`).then(r => r.json()),
      fetch(`${API}/catalogos/municipios`).then(r => r.json()),
    ]);
    catalogoFases       = fases.data       || [];
    catalogoConsultores = consultores.data || [];
    todosLosServicios   = servicios.data   || [];
    todosLosMunicipios  = municipios.data  || [];

    llenarSelect('upFaseVenta', catalogoFases,       'id', 'descripcion');
    llenarSelect('upConsultor', catalogoConsultores, 'id', 'descripcion');

    // Poblar selector de servicio en formulario actualizar
    const selServicio = document.getElementById('upIdServicio');
    if (selServicio) {
      selServicio.innerHTML = '<option value="">— Sin cambio —</option>';
      todosLosServicios.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id; o.textContent = s.descripcion;
        selServicio.appendChild(o);
      });
    }

    // Poblar filtro de fases en la grilla
    const filtroFase = document.getElementById('filtroFase');
    catalogoFases.forEach(f => {
      const o = document.createElement('option');
      o.value = normalizarTexto(f.descripcion);
      o.textContent = f.descripcion;
      filtroFase.appendChild(o);
    });

    // Bloquear consultor al usuario en sesión
    const s = document.getElementById('upConsultor');
    for (const o of s.options) {
      if (normalizarTexto(o.text) === normalizarTexto(usuario)) { s.value = o.value; break; }
    }
    s.disabled = true;

    // Fecha del movimiento: automática
    const fechaEl = document.getElementById('upFecha');
    fechaEl.valueAsDate = new Date();
    fechaEl.readOnly    = true;

    // Listener tiempoMeses: recalcula mes-fin y fecha-fin al cambiar
    const elTM = document.getElementById('upTiempoMeses');
    if (elTM) {
      elTM.addEventListener('input', function () {
        const v = parseInt(this.value) || 0;
        if (v > 72) { this.value = 72; }
        if (v < 1 && this.value !== '') { this.value = 1; }
        tiempoMesesActiva = parseInt(this.value) || 0;
        calcularMesFinActualizar();
        calcularFechaFinActualizar();
      });
    }

  } catch (e) { toast('Error cargando catálogos.', 'err'); }
}

// ── FILTRO MUNICIPIO (formulario actualizar) ────────────────────────────
function filtrarMunicipiosUp() {
  const q   = document.getElementById('upBuscarMunicipio').value.toLowerCase();
  const sel = document.getElementById('upIdMunicipio');
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

// ── CARGAR GRILLA DE OPORTUNIDADES ───────────────────────────────
async function cargarGrilla() {
  document.getElementById('grillaLoading').style.display = 'flex';
  document.getElementById('grillaWrap').style.display    = 'none';

  // Actualizar título según rol
  const titulo = document.getElementById('tituloGrilla');
  if (verTodos) {
    titulo.textContent = 'Todas las Oportunidades';
  } else {
    titulo.textContent = `Mis Oportunidades — ${usuario}`;
  }

  try {
    const res = await fetch(`${API}/oportunidades`).then(r => r.json());
    let opps  = res.data || [];

    // Filtrar por consultor si no es admin/supervisor
    if (!verTodos) {
      opps = opps.filter(o => {
        const consultor = normalizarTexto(
          resolveField(o, 'consultorActual', 'consultor', 'nombreConsultor') || ''
        );
        return consultor === normalizarTexto(usuario);
      });
    }

    todasLasOportunidades = opps;
    renderGrilla(todasLasOportunidades);

  } catch (e) {
    toast('Error cargando oportunidades.', 'err');
    document.getElementById('grillaLoading').style.display = 'none';
    document.getElementById('grillaWrap').style.display    = 'block';
  }
}

// ── RENDERIZAR GRILLA ─────────────────────────────────────────────
function renderGrilla(opps) {
  document.getElementById('grillaLoading').style.display = 'none';
  document.getElementById('grillaWrap').style.display    = 'block';

  document.getElementById('grillaBadge').textContent = `${opps.length} oportunidad${opps.length !== 1 ? 'es' : ''}`;

  const tbody    = document.getElementById('grillaBody');
  const noData   = document.getElementById('grillaVacia');

  if (!opps.length) {
    tbody.innerHTML = '';
    noData.style.display = 'flex';
    return;
  }
  noData.style.display = 'none';

  tbody.innerHTML = opps.map(o => {
    const cot      = o.numeroCotizacion || `#${o.idOportunidad}`;
    const cliente  = o.prospectoCliente || o.razonSocial || '—';
    const fase     = resolveField(o, 'faseVenta', 'fase', 'descripcionFase') || '—';
    const tipoCierre = (o.tipoCierre || '').toUpperCase();
    const clsFase  = tipoCierre === 'GANADA' ? 'pill-ganada' : tipoCierre === 'PERDIDA' ? 'pill-perdida' : 'pill-activa';
    const vm       = parseFloat(resolveField(o, 'valorMensual', 'valor') || 0);
    const meses    = parseInt(o.tiempoMeses || 0);
    const consultor= resolveField(o, 'consultorActual', 'consultor', 'nombreConsultor') || '—';
    const fecha    = fmtFecha(resolveField(o, 'fechaPrimerRegistro', 'fechaRegistro', 'fecha', 'createdAt'));
    const idOp     = o.idOportunidad ? String(o.idOportunidad) : '';

    // Identificador para cargar: prefiero numeroCotizacion, si no idOportunidad
    const idParam  = o.numeroCotizacion
      ? `cot:${encodeURIComponent(o.numeroCotizacion)}`
      : idOp ? `id:${idOp}` : null;

    const onClickFn = idParam ? `seleccionarOportunidad('${idParam}')` : `toast('Oportunidad sin identificador válido','err')`;
    return `<tr class="grilla-row" onclick="${onClickFn}">
      <td><span class="cot-chip">${cot}</span></td>
      <td class="cliente-cell"><span title="${cliente}">${cliente}</span></td>
      <td><span class="fase-pill ${clsFase}">${fase}</span></td>
      <td class="num-cell">${formatCOP(vm)}</td>
      <td class="num-cell">${meses} mes${meses !== 1 ? 'es' : ''}</td>
      <td class="col-consultor">${consultor}</td>
      <td>${fecha}</td>
      <td style="text-align:center">
        <button class="btn-ver" onclick="event.stopPropagation();${onClickFn}">
          <i class="bi bi-eye-fill"></i> Ver
        </button>
      </td>
    </tr>`;
  }).join('');
}

// ── FILTRAR GRILLA ────────────────────────────────────────────────
function filtrarGrilla() {
  const q       = normalizarTexto(document.getElementById('inputBusqueda').value);
  const fase    = document.getElementById('filtroFase').value;
  const estado  = document.getElementById('filtroEstado').value;
  const btnX    = document.getElementById('btnLimpiarBusqueda');

  btnX.style.display = q ? 'flex' : 'none';

  const filtradas = todasLasOportunidades.filter(o => {
    // Texto libre (cotización, cliente, NIT)
    if (q) {
      const cot     = normalizarTexto(o.numeroCotizacion || String(o.idOportunidad || ''));
      const cliente = normalizarTexto(o.prospectoCliente || o.razonSocial || '');
      const nit     = normalizarTexto(o.nit || '');
      if (!cot.includes(q) && !cliente.includes(q) && !nit.includes(q)) return false;
    }
    // Filtro fase
    if (fase) {
      const faseoOp = normalizarTexto(resolveField(o, 'faseVenta', 'fase', 'descripcionFase') || '');
      if (faseoOp !== fase) return false;
    }
    // Filtro estado
    if (estado) {
      const tipo = (o.tipoCierre || '').toLowerCase();
      if (estado === 'ganada'  && tipo !== 'ganada')  return false;
      if (estado === 'perdida' && tipo !== 'perdida') return false;
      if (estado === 'activa'  && (tipo === 'ganada' || tipo === 'perdida')) return false;
    }
    return true;
  });

  renderGrilla(filtradas);
}

function limpiarBusqueda() {
  document.getElementById('inputBusqueda').value = '';
  document.getElementById('btnLimpiarBusqueda').style.display = 'none';
  filtrarGrilla();
}

// ── SELECCIONAR OPORTUNIDAD DE LA GRILLA ─────────────────────────
async function seleccionarOportunidad(idParam) {
  try {
    let res;
    if (idParam.startsWith('cot:')) {
      const cot = decodeURIComponent(idParam.slice(4));
      res = await fetch(`${API}/oportunidades/${encodeURIComponent(cot)}`).then(r => r.json());
    } else {
      // id: buscar por idOportunidad
      const id = idParam.slice(3);
      res = await fetch(`${API}/oportunidades/id/${id}`).then(r => r.json());
    }
    if (res.success && res.data) {
      mostrarDetalle(res.data);
      document.getElementById('cardGrilla').style.display = 'none';
    } else {
      toast('No se pudo cargar la oportunidad.', 'err');
    }
  } catch (e) { toast('Error de conexión.', 'err'); }
}

// ── VOLVER A GRILLA ───────────────────────────────────────────────
function volverAGrilla() {
  document.getElementById('detalleOportunidad').style.display = 'none';
  document.getElementById('cardGrilla').style.display         = 'block';
  cotizacionActiva    = null;
  idOportunidadActiva = null;
  tiempoMesesActiva   = 0;
  ordenFaseActiva     = 0;
  idFaseActiva        = 0;
  limpiarFormActualizar();
}

// ── BÚSQUEDA LEGACY (mantiene compatibilidad con sesión activa) ───
async function buscarOportunidad() {
  const q = document.getElementById('inputBusqueda').value.trim();
  if (!q) { filtrarGrilla(); return; }
  // Si el input tiene texto busca en la grilla ya cargada
  filtrarGrilla();
  // Si no hay resultados en grilla intenta como cotización exacta vs API
  const tbody = document.getElementById('grillaBody');
  if (!tbody.innerHTML.trim()) {
    try {
      const res = await fetch(`${API}/oportunidades/${encodeURIComponent(q.toUpperCase())}`).then(r => r.json());
      if (res.success && res.data) { mostrarDetalle(res.data); document.getElementById('cardGrilla').style.display = 'none'; }
    } catch (e) {}
  }
}

// ── MOSTRAR DETALLE ───────────────────────────────────────────────
function mostrarDetalle(data) {
  const cab  = data.cabecera;
  const hist = data.historial || [];
  cotizacionActiva    = cab.numeroCotizacion || null;
  idOportunidadActiva = cab.idOportunidad    || null;
  tiempoMesesActiva   = parseInt(cab.tiempoMeses || 0);
  // OrdenFunnel: match the current fase from catalogoFases by name
  const faseCabeceraObj = catalogoFases.find(f =>
    normalizarTexto(f.descripcion) === normalizarTexto(cab.faseVenta || '')
  );
  ordenFaseActiva = parseInt(faseCabeceraObj?.ordenFunnel || faseCabeceraObj?.OrdenFunnel || cab.ordenFunnel || 0);
  idFaseActiva    = parseInt(faseCabeceraObj?.id || cab.idFaseVenta || cab.idFase || 0);
  // Pre-llenar tiempoMeses en el form
  const elTiempoUp = document.getElementById('upTiempoMeses');
  if (elTiempoUp) elTiempoUp.value = tiempoMesesActiva || '';

  document.getElementById('detalleOportunidad').style.display = 'block';
  document.getElementById('cardGrilla').style.display         = 'none';

  const cotLabel = cab.numeroCotizacion || `#${cab.idOportunidad}`;
  document.getElementById('tituloDetalle').textContent = `${cotLabel} — ${cab.prospectoCliente}`;

  const badge = document.getElementById('badgeFase');
  const tipo  = cab.tipoCierre;
  const cls   = tipo === 'GANADA' ? 'ganada' : tipo === 'PERDIDA' ? 'perdida' : 'activa';
  badge.innerHTML = `<span class="fase-badge ${cls}">⬤ ${cab.faseVenta}</span>`;

  const vm     = parseFloat(cab.valorMensual) || 0;
  const costo  = parseFloat(cab.costo)        || 0;
  const aiuAbs = vm - costo;
  const aiuPct = vm > 0 ? (aiuAbs / vm * 100) : 0;

  document.getElementById('kpiRow').innerHTML = `
    <div class="kpi-card azul">
      <div class="kpi-lbl">Valor Mensual</div>
      <div class="kpi-val">${formatCOP(vm)}</div>
      <div class="kpi-sub">Tarifa propuesta</div>
    </div>
    <div class="kpi-card verde">
      <div class="kpi-lbl">Monto Total</div>
      <div class="kpi-val">${formatCOP(cab.montoTotalDuracion)}</div>
      <div class="kpi-sub">${cab.tiempoMeses} meses</div>
    </div>
    <div class="kpi-card naranja">
      <div class="kpi-lbl">Valor Ponderado</div>
      <div class="kpi-val">${formatCOP(cab.valorPonderado)}</div>
      <div class="kpi-sub">${parseFloat(cab.probabilidadVenta || 0) * 100}% probabilidad</div>
    </div>
    <div class="kpi-card ${tipo === 'GANADA' ? 'verde' : tipo === 'PERDIDA' ? 'rojo' : 'azul'}">
      <div class="kpi-lbl">% AIU Mensual</div>
      <div class="kpi-val">${aiuPct.toFixed(2)}%</div>
      <div class="kpi-sub">${formatCOP(aiuAbs)} AIU abs.</div>
    </div>`;

  document.getElementById('infoGrid').innerHTML = `
    <div class="info-item"><div class="lbl">NIT</div><div class="val">${cab.nit || 'No registrado'}</div></div>
    <div class="info-item"><div class="lbl">Sector Económico</div><div class="val">${cab.sectorEconomico || '—'}</div></div>
    <div class="info-item"><div class="lbl">Tipo Cliente</div><div class="val">${cab.tipoCliente || '—'}</div></div>
    <div class="info-item"><div class="lbl">Servicio</div><div class="val">${cab.servicio || '—'}</div></div>
    <div class="info-item"><div class="lbl">Modalidad</div><div class="val">${cab.modalidadContrato || '—'}</div></div>
    <div class="info-item"><div class="lbl">Licitación</div><div class="val">${cab.licitacion || '—'}</div></div>
    <div class="info-item"><div class="lbl">Región</div><div class="val">${cab.region || '—'}</div></div>
    <div class="info-item"><div class="lbl">Departamento</div><div class="val">${cab.departamento || '—'}</div></div>
    <div class="info-item"><div class="lbl">Ciudad</div><div class="val">${cab.ciudad || '—'}</div></div>
    <div class="info-item"><div class="lbl">Consultor Actual</div><div class="val">${cab.consultorActual || '—'}</div></div>
    <div class="info-item"><div class="lbl">Mes Inicio / Fin</div>
      <div class="val">${cab.idMesInicio ? NOMBRES_MESES[cab.idMesInicio - 1] : (cab.mesInicio || '—')} → ${cab.mesFin || '—'}</div>
    </div>
    <div class="info-item"><div class="lbl">Fecha Inicio Servicio</div>
      <div class="val">${cab.fechaInicioServicio ? fmtFecha(cab.fechaInicioServicio) : '<em style="color:#8896B0;font-style:italic">Sin registrar</em>'}</div>
    </div>
    <div class="info-item"><div class="lbl">Fecha Fin Servicio</div>
      <div class="val">${cab.fechaFinServicio ? fmtFecha(cab.fechaFinServicio) : '<em style="color:#8896B0;font-style:italic">Sin registrar</em>'}</div>
    </div>
    <div class="info-item"><div class="lbl">Primer Registro</div><div class="val">${fmtFecha(cab.fechaPrimerRegistro)}</div></div>
    <div class="info-item" id="infoCotizacion">
      <div class="lbl">N° Cotización</div>
      <div class="val" style="display:flex;align-items:center;gap:8px">
        <span id="cotizacionValor">${cab.numeroCotizacion || '<em style="color:#8896B0;font-style:italic">Sin asignar</em>'}</span>

      </div>
    </div>`;

  const panelEdit = document.getElementById('cardEditCotizacion');
  if (panelEdit) {
    panelEdit.style.display = 'none';
    document.getElementById('editNumeroCotizacion').value = cab.numeroCotizacion || '';
  }

  const pct = parseFloat(cab.probabilidadVenta || 0) * 100;
  document.getElementById('funnelFill').style.width   = pct + '%';
  document.getElementById('funnelLabel').textContent  = `${pct}% — ${cab.faseVenta}`;

  // HISTORIAL
  const tl = document.getElementById('timeline');
  if (!hist.length) {
    tl.innerHTML = `<p style="color:#8896B0;font-size:0.88rem;padding:12px 0">
      <i class="bi bi-info-circle me-2"></i>Sin movimientos registrados aún.</p>`;
  } else {
    tl.innerHTML = hist.map(m => {
      // resolveHistField maneja tanto camelCase (DTO tipado) como PascalCase (dynamic Dapper)
      const fase     = resolveHistField(m, 'faseVenta',           'FaseVenta',           'fase', 'descripcionFase') || '—';
      const consultor= resolveHistField(m, 'consultor',           'Consultor',           'nombreConsultor') || '—';
      const fecha    = resolveHistField(m, 'fechaActualizacion',   'FechaActualizacion',  'fecha', 'fechaMovimiento', 'fechaRegistro');
      const vigente  = resolveHistField(m, 'esVigente',           'EsVigente',           'vigente') || false;
      const obs      = resolveHistField(m, 'observacion',         'Observacion',         'observaciones') || '';
      const mVm      = parseFloat(resolveHistField(m, 'valorMensual',  'ValorMensual')  || 0);
      const mCosto   = parseFloat(resolveHistField(m, 'costo',         'Costo')         || 0);
      const mAiuAbs  = parseFloat(resolveHistField(m, 'aIUAbsoluto',   'AIUAbsoluto',   'aiuAbsoluto') ?? (mVm - mCosto));
      const mAiuPct  = mVm > 0
        ? (mAiuAbs / mVm * 100)
        : parseFloat(resolveHistField(m, 'porcentajeAIU', 'PorcentajeAIU', 'porcentajeAiu') || 0);
      const prob     = parseFloat(resolveHistField(m, 'porcentajeProbabilidad', 'PorcentajeProbabilidad') || 0);
      return `
      <div class="timeline-item ${vigente ? 'vigente' : ''}">
        <div class="timeline-card ${vigente ? 'vigente' : ''}">
          <div class="tc-header">
            <span class="tc-fase">${fase}</span>
            <div style="display:flex;align-items:center;gap:8px">
              ${vigente ? '<span class="vigente-tag">VIGENTE</span>' : ''}
              <span class="tc-fecha">${fmtFecha(fecha)} — ${consultor}</span>
            </div>
          </div>
          <div class="tc-meta">
            <div class="tc-kv"><span class="k">Valor Mensual</span><span class="v">${formatCOP(mVm)}</span></div>
            <div class="tc-kv"><span class="k">Costo</span><span class="v">${formatCOP(mCosto)}</span></div>
            <div class="tc-kv"><span class="k">AIU Abs.</span><span class="v">${formatCOP(mAiuAbs)}</span></div>
            <div class="tc-kv"><span class="k">% AIU</span><span class="v">${mAiuPct.toFixed(2)}%</span></div>
            <div class="tc-kv"><span class="k">Probabilidad</span><span class="v">${prob}%</span></div>
          </div>
          ${obs ? `<div class="tc-obs">💬 ${obs}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // Pre-llenar valores vigentes en el formulario de actualización
  document.getElementById('upValorMensual').value = vm    > 0 ? formatMoney(vm)    : '';
  document.getElementById('upCosto').value        = costo > 0 ? formatMoney(costo) : '';

  // Pre-llenar NIT
  if (cab.nit) document.getElementById('upNit').value = cab.nit;

  // Pre-llenar N° Cotización actual (para que el usuario lo vea y actualice si cambia)
  const elCot = document.getElementById('upNumeroCotizacion');
  if (elCot) elCot.value = cab.numeroCotizacion || '';

  // Pre-llenar servicio (por texto, ya que la cabecera no expone IdServicio directamente)
  const selServ = document.getElementById('upIdServicio');
  if (selServ && cab.servicio) {
    const matchServicio = Array.from(selServ.options).find(
      o => normalizarTexto(o.textContent) === normalizarTexto(cab.servicio)
    );
    if (matchServicio) selServ.value = matchServicio.value;
  }

  // Pre-llenar mes inicio (usa idMesInicio del cabecera — expuesto por la view)
  const mesIni = parseInt(cab.idMesInicio || cab.mesInicioServicio || 0);
  if (mesIni) {
    document.getElementById('upMesInicioServicio').value = mesIni;
    calcularMesFinActualizar();
  }

  // Pre-llenar fechas si vienen en cabecera
  if (cab.fechaInicioServicio) document.getElementById('upFechaInicioServicio').value = cab.fechaInicioServicio.slice(0, 10);
  if (cab.fechaFinServicio)    document.getElementById('upFechaFinServicio').value    = cab.fechaFinServicio.slice(0, 10);
  if (cab.fechaInicioServicio) calcularMesFinActualizar();

  calcularAIU2();

  document.getElementById('cardActualizar').style.display = cab.esCierre ? 'none' : 'block';
  if (cab.esCierre) toast(`Esta oportunidad está cerrada: ${cab.tipoCierre || 'CERRADA'}`, 'ok');

  // Scroll suave al detalle
  setTimeout(() => document.getElementById('detalleOportunidad').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

// ── CÁLCULO AIU ───────────────────────────────────────────────────
function calcularAIU2() {
  const vm  = parseMoney(document.getElementById('upValorMensual').value);
  const c   = parseMoney(document.getElementById('upCosto').value);
  const aiu = vm - c;
  const pct = vm > 0 ? (aiu / vm * 100) : 0;
  document.getElementById('upAiuAbs').textContent = formatCOP(aiu);
  document.getElementById('upAiuPct').textContent = pct.toFixed(2) + '%';
}

// ── CALCULAR MES FIN (actualizar) ────────────────────────────────
// Ejemplo: Enero(1) + 3 meses = Marzo(3)
function calcularMesFinActualizar() {
  const mesInicioVal = parseInt(document.getElementById('upMesInicioServicio').value);
  const meses        = tiempoMesesActiva;
  const mesFinEl     = document.getElementById('upMesFinServicio');
  if (!mesInicioVal || meses <= 0) { mesFinEl.value = ''; return; }
  const idxFin   = ((mesInicioVal - 1) + (meses - 1)) % 12;
  mesFinEl.value = NOMBRES_MESES[idxFin];
}

// ── CALCULAR FECHA FIN (actualizar) ──────────────────────────────
// fechaFin = fechaInicio + tiempoMeses − 1 día
// Ejemplo: 15/04/2026 + 3 meses → 14/07/2026
function calcularFechaFinActualizar() {
  const fechaInicio = document.getElementById('upFechaInicioServicio').value;
  const meses       = tiempoMesesActiva;
  const finEl       = document.getElementById('upFechaFinServicio');
  if (!fechaInicio || meses <= 0) { finEl.value = ''; return; }
  const [y, m, d] = fechaInicio.split('-').map(Number);
  const fechaFin  = new Date(y, m - 1 + meses, d - 1);
  const yy  = fechaFin.getFullYear();
  const mm  = String(fechaFin.getMonth() + 1).padStart(2, '0');
  const dd  = String(fechaFin.getDate()).padStart(2, '0');
  finEl.value = `${yy}-${mm}-${dd}`;
}

// ── ACTUALIZAR FASE ───────────────────────────────────────────────
// Envía idOportunidad (prioritario según SP) + numeroCotizacion (fallback)
async function actualizarFase() {
  if (!idOportunidadActiva && !cotizacionActiva) {
    toast('No hay oportunidad seleccionada.', 'err'); return;
  }

  // Campos obligatorios — incluye mes y fecha de inicio
  const reqs = ['upFaseVenta', 'upConsultor', 'upTiempoMeses', 'upMesInicioServicio', 'upFechaInicioServicio'];
  let ok = true;
  reqs.forEach(id => {
    const el = document.getElementById(id);
    if (!el || !el.value) { if (el) el.classList.add('error'); ok = false; }
    else el.classList.remove('error');
  });

  const obsEl = document.getElementById('upObservacion');
  if (!obsEl.value.trim()) { obsEl.classList.add('error'); ok = false; }
  else obsEl.classList.remove('error');

  if (!ok) { toast('Completa todos los campos obligatorios (✦).', 'err'); return; }

  // ── Validar retroceso de fase ────────────────────────────────────────
  // No se permite registrar una fase con menor OrdenFunnel que la actual.
  // SÍ se permite registrar la misma fase (para correcciones de datos).
  const nuevaFaseSel  = document.getElementById('upFaseVenta');
  const nuevaFaseId   = parseInt(nuevaFaseSel.value);
  const nuevaFaseText = nuevaFaseSel.options[nuevaFaseSel.selectedIndex]?.text || '';
  const nuevaFaseObj  = catalogoFases.find(f => f.id === nuevaFaseId);
  const nuevaOrden    = parseInt(nuevaFaseObj?.ordenFunnel || nuevaFaseObj?.OrdenFunnel || 0);

  if (ordenFaseActiva > 0 && nuevaOrden > 0 && nuevaFaseId !== idFaseActiva && nuevaOrden < ordenFaseActiva) {
    nuevaFaseSel.classList.add('error');
    const faseActualNombre = catalogoFases.find(f => {
      const ord = parseInt(f.ordenFunnel || f.OrdenFunnel || 0);
      return ord === ordenFaseActiva;
    })?.descripcion || '';
    const confirm = await Swal.fire({
      icon: 'warning',
      title: '¿Retroceder de fase?',
      html: `La oportunidad está actualmente en <strong>${faseActualNombre}</strong>.<br>
             Estás intentando registrar <strong>${nuevaFaseText}</strong> que es una fase anterior.<br><br>
             ⚠️ Esto no está permitido para mantener la integridad del pipeline.`,
      confirmButtonColor: '#003087',
      confirmButtonText: 'Entendido',
    });
    return;
  }
  nuevaFaseSel.classList.remove('error');

  // Validar que la Fecha Inicio corresponda al Mes Inicio seleccionado
  const mesInicioSelUp = parseInt(document.getElementById('upMesInicioServicio').value);
  const fechaIniUp     = document.getElementById('upFechaInicioServicio').value;
  if (mesInicioSelUp && fechaIniUp) {
    const mesRealUp = new Date(fechaIniUp + 'T00:00:00').getMonth() + 1;
    if (mesRealUp !== mesInicioSelUp) {
      document.getElementById('upFechaInicioServicio').classList.add('error');
      toast(`La Fecha de Inicio (${NOMBRES_MESES[mesRealUp-1]}) no corresponde al Mes de Inicio seleccionado (${NOMBRES_MESES[mesInicioSelUp-1]}).`, 'err');
      return;
    }
    document.getElementById('upFechaInicioServicio').classList.remove('error');
  }

  const vm = parseMoney(document.getElementById('upValorMensual').value);
  const c  = parseMoney(document.getElementById('upCosto').value);

  // Validación de valores según fase
  const permiteValorCero = fasePermiteValorCero();
  if (!permiteValorCero) {
    const vmEl = document.getElementById('upValorMensual');
    const cEl  = document.getElementById('upCosto');
    if (vm <= 0) { vmEl.classList.add('error'); toast('El Valor Mensual debe ser mayor a $0 para esta fase.', 'err'); return; }
    vmEl.classList.remove('error');
    if (c <= 0) { cEl.classList.add('error'); toast('El Costo debe ser mayor a $0 para esta fase.', 'err'); return; }
    cEl.classList.remove('error');
  }
  if (vm > 0 && c >= vm) {
    toast('El Costo no puede ser igual o mayor al Valor Mensual (AIU debe ser > 0%).', 'err');
    document.getElementById('upCosto').classList.add('error'); return;
  }
  document.getElementById('upCosto').classList.remove('error');

  const btn = document.getElementById('btnActualizar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Guardando...';

  // Campos de mes y fecha (opcionales)
  const mesInicioVal = parseInt(document.getElementById('upMesInicioServicio').value) || null;
  // mesFinServicio no se envía al backend (la BD lo calcula vía IdMesFin COMPUTED)
  const fechaIni     = document.getElementById('upFechaInicioServicio').value || null;
  const fechaFin     = document.getElementById('upFechaFinServicio').value    || null;

  // Datos maestros opcionales
  const upNit           = document.getElementById('upNit').value.trim() || null;
  const upIdServicio    = parseInt(document.getElementById('upIdServicio').value) || null;
  const upIdMunicipio   = parseInt(document.getElementById('upIdMunicipio').value) || null;
  const upNuevaCotizacion = document.getElementById('upNumeroCotizacion').value.trim().toUpperCase() || null;
  const upTiempoMesesVal  = parseInt(document.getElementById('upTiempoMeses').value) || null;

  const body = {
    // Identificadores
    idOportunidad:       idOportunidadActiva,
    numeroCotizacion:    cotizacionActiva,
    // Movimiento (obligatorio)
    idConsultor:         parseInt(document.getElementById('upConsultor').value),
    fecha:               document.getElementById('upFecha').value,
    idFaseVenta:         parseInt(document.getElementById('upFaseVenta').value),
    valorMensual:        vm,
    costo:               c,
    observacion:         obsEl.value.trim() || null,
    // Datos maestros opcionales (NULL = sin cambio en BD)
    nit:                 upNit,
    nuevoCotizacion:     upNuevaCotizacion,    // mapea a NuevoCotizacion en DTO
    tiempoMeses:         upTiempoMesesVal,     // mapea a TiempoMeses en DTO (obligatorio)
    idServicio:          upIdServicio,
    idMunicipio:         upIdMunicipio,
    idMesInicio:         mesInicioVal,         // mapea a IdMesInicio en DTO
    fechaInicioServicio: fechaIni,
    fechaFinServicio:    fechaFin,
    // mesFinServicio NO se envía: la BD lo calcula automáticamente (COMPUTED PERSISTED)
  };

  try {
    const res = await fetch(`${API}/oportunidades/actualizar-fase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const label = cotizacionActiva || `#${idOportunidadActiva}`;
      await Swal.fire({
        icon: 'success',
        title: '¡Movimiento Registrado!',
        html: `El pipeline de <strong>${label}</strong> fue actualizado correctamente.`,
        confirmButtonColor: '#39B54A',
        confirmButtonText: '<i class="bi bi-check2-circle me-1"></i>Entendido',
        timer: 3000, timerProgressBar: true
      });

      // Recargar detalle usando idOportunidad o cotización
      let det;
      if (idOportunidadActiva) {
        det = await fetch(`${API}/oportunidades/id/${idOportunidadActiva}`).then(r => r.json());
        if (!det.success && cotizacionActiva) {
          det = await fetch(`${API}/oportunidades/${encodeURIComponent(cotizacionActiva)}`).then(r => r.json());
        }
      } else {
        det = await fetch(`${API}/oportunidades/${encodeURIComponent(cotizacionActiva)}`).then(r => r.json());
      }
      if (det && det.success) mostrarDetalle(det.data);
      limpiarFormActualizar();

      // Refrescar grilla en background
      cargarGrilla();

    } else {
      toast(data.message || 'Error al actualizar.', 'err');
    }
  } catch (e) {
    toast('Error de conexión con la API.', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send"></i> Registrar Movimiento';
  }
}

// ── LIMPIAR FORM ACTUALIZAR ───────────────────────────────────────
function limpiarFormActualizar() {
  document.getElementById('upFaseVenta').selectedIndex         = 0;
  document.getElementById('upFecha').valueAsDate               = new Date();
  document.getElementById('upObservacion').value              = '';
  document.getElementById('upValorMensual').value             = '';
  document.getElementById('upCosto').value                    = '';
  document.getElementById('upMesInicioServicio').selectedIndex = 0;
  document.getElementById('upMesFinServicio').value           = '';
  document.getElementById('upFechaInicioServicio').value      = '';
  document.getElementById('upFechaFinServicio').value         = '';
  // Nuevos campos opcionales
  document.getElementById('upNit').value              = '';
  document.getElementById('upNumeroCotizacion').value = '';
  const elTM2 = document.getElementById('upTiempoMeses');
  if (elTM2) elTM2.value = '';
  const selS = document.getElementById('upIdServicio');
  if (selS) selS.selectedIndex = 0;
  const selM = document.getElementById('upIdMunicipio');
  if (selM) selM.innerHTML = '<option value="">— Busca primero arriba —</option>';
  const buscarM = document.getElementById('upBuscarMunicipio');
  if (buscarM) buscarM.value = '';
  calcularAIU2();
}

// ── EDITAR N° COTIZACIÓN ─────────────────────────────────────────
function mostrarEditCotizacion() {
  // La edición de cotización ahora está integrada en el formulario de actualización.
  // Esta función se mantiene por compatibilidad pero ya no abre panel separado.
}

async function guardarNumeroCotizacion() {
  if (!idOportunidadActiva) { toast('No se puede identificar la oportunidad.', 'err'); return; }
  const nuevo = document.getElementById('editNumeroCotizacion').value.trim().toUpperCase();
  const btn   = document.querySelector('#cardEditCotizacion .btn-primary');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Guardando...';
  try {
    const res = await fetch(`${API}/oportunidades/asignar-cotizacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idOportunidad: idOportunidadActiva, nuevoNumeroCotizacion: nuevo || null })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast(`N° Cotización ${nuevo ? 'asignado: ' + nuevo : 'eliminado'} correctamente.`, 'ok');
      document.getElementById('cotizacionValor').innerHTML = nuevo || '<em style="color:#8896B0;font-style:italic">Sin asignar</em>';
      cotizacionActiva = nuevo || cotizacionActiva;
      document.getElementById('cardEditCotizacion').style.display = 'none';
      cargarGrilla();
    } else {
      toast(data.message || 'Error al actualizar N° Cotización.', 'err');
    }
  } catch (e) { toast('Error de conexión.', 'err'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Guardar'; }
}

// ── INIT ──────────────────────────────────────────────────────────
(async () => {
  await cargarCatalogos();
  await cargarGrilla();

  // Si viene desde nueva-oportunidad con cotización activa, abrir directo
  const cotActiva = sessionStorage.getItem('crm_cotizacion_activa');
  if (cotActiva) {
    sessionStorage.removeItem('crm_cotizacion_activa');
    document.getElementById('inputBusqueda').value = cotActiva;
    filtrarGrilla();
    // Intentar abrir directo
    try {
      const res = await fetch(`${API}/oportunidades/${encodeURIComponent(cotActiva)}`).then(r => r.json());
      if (res.success && res.data) { mostrarDetalle(res.data); document.getElementById('cardGrilla').style.display = 'none'; }
    } catch (e) {}
  }
})();
