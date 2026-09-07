/* ================================================================
   logicaPipeline.js — CRM Honor · Dashboard Pipeline v4
   ================================================================ */

const API = 'http://localhost:5000/api';

/* ── Paleta ─────────────────────────────────────────────────── */
const C = {
  azul:'#003087', azulMed:'#004BB8', azulCl:'#0066CC',
  verde:'#39B54A', verdeDk:'#2A8C38',
  naranja:'#E07B00', rojo:'#D93025',
  purpura:'#7B1FA2', dorado:'#B8860B',
  grisMed:'#6B7A9A', grisSuave:'#F4F6FA',
  cortes:['#003087','#004BB8','#0066CC','#2A8C38','#39B54A','#6BBF4E',
          '#E07B00','#D93025','#7B1FA2','#B8860B','#0097A7','#455A64']
};

const FUNNEL_PALETTE = [
  '#3B82F6','#6366F1','#06B6D4','#10B981','#84CC16',
  '#F59E0B','#F97316','#EF4444','#EC4899','#8B5CF6',
  '#0EA5E9','#14B8A6'
];

/* ── Auth guard ─────────────────────────────────────────────── */
// [v5] El control de sesión y de acceso a la página lo hace guard-sesion.js
//      (cargado antes que este archivo). Aquí solo se leen los datos ya
//      resueltos: una sola fuente de verdad para los permisos.
//      Indicadores ahora es visible para ADMIN y SUPERVISOR.
const usuario = (window.CRM_SESION && window.CRM_SESION.usuario) || sessionStorage.getItem('crm_usuario');
const rol     = (window.CRM_SESION && window.CRM_SESION.rol)     || sessionStorage.getItem('crm_rol');
document.getElementById('navUsuario').textContent = usuario || '';
function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

/* ── Estado ──────────────────────────────────────────────────── */
const charts = {};

// Filtros para servicio / region / clientes: 'todas' | 'ganada' | 'abierta'
let filtroServicio  = 'todas';
let filtroRegion    = 'todas';
let filtroClientes  = 'todas';

// Forecast
let forecastData           = null;
let metaAnualTotal         = 0;    // meta total empresa del año activo
let metaMensualPorMes      = [];   // [12] meta mensual empresa ENE..DIC
let metaMensualPorConsultor = {};  // {nombreConsultor: [12] metaMensual}
let vistaForecast          = 'total';
let filtroFcConsultor      = '';   // '' = todos
let aiuData                = null;
let filtroAiuMes           = 0;    // 0 = año completo, 1-12 = mes
let forecastFullscreen     = false;
let funnelFullscreen       = false;

/* ── Selector de año ─────────────────────────────────────────── */
const selectAnio = document.getElementById('selectAnio');
(function poblarAnios() {
  const hoy = new Date().getFullYear();
  for (let y = hoy; y >= hoy - 3; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    selectAnio.appendChild(o);
  }
})();

/* ── Moneda ──────────────────────────────────────────────────── */
function cop(val) {
  const n = Number(val || 0);
  if (n >= 1_000_000_000) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1_000_000)     return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1_000)         return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}
function copFull(val) {
  return '$' + Number(val || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
function scrollTo(id) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }

/* ══════════════════════════════════════════════════════════════
   CARGA PRINCIPAL
══════════════════════════════════════════════════════════════ */
async function cargarTodo() {
  const anio = selectAnio.value;
  const est  = document.getElementById('estadoCarga');
  est.textContent  = '⟳ Cargando...';
  est.style.color  = '';

  try {
    const [resumen, fases, consultores, evolucion, servicios,
           modalidades, topClientes, regiones, forecast, aiu, metaResp, efectividadResp] = await Promise.all([
      fetch(`${API}/pipeline/resumen?anio=${anio}`).then(r => r.json()),
      fetch(`${API}/pipeline/por-fase?anio=${anio}`).then(r => r.json()),
      fetch(`${API}/pipeline/por-consultor?anio=${anio}`).then(r => r.json()),
      fetch(`${API}/pipeline/evolucion-mensual?anio=${anio}`).then(r => r.json()),
      fetch(`${API}/pipeline/por-servicio?anio=${anio}&filtro=${filtroServicio}`).then(r => r.json()),
      fetch(`${API}/pipeline/por-modalidad?anio=${anio}`).then(r => r.json()),
      fetch(`${API}/pipeline/top-clientes?anio=${anio}&top=10&filtro=${filtroClientes}`).then(r => r.json()),
      fetch(`${API}/pipeline/por-region?anio=${anio}&filtro=${filtroRegion}`).then(r => r.json()),
      fetch(`${API}/pipeline/forecast?anio=${anio}${filtroFcConsultor ? '&consultor=' + encodeURIComponent(filtroFcConsultor) : ''}`).then(r => r.json()),
      fetch(`${API}/pipeline/aiu?anio=${anio}`).then(r => r.json()),
      fetch(`${API}/metas/${anio}`).then(r => r.json()).catch(() => ({ success: false })),
      fetch(`${API}/pipeline/efectividad-ofertas?anio=${anio}${filtroFcConsultor ? '&consultor=' + encodeURIComponent(filtroFcConsultor) : ''}`).then(r => r.json()).catch(() => ({ success: false })),
    ]);

    renderKpis(resumen.data);
    renderFunnel(fases.data);
    renderModalidad(modalidades.data);
    renderConsultor(consultores.data);
    renderEvolucion(evolucion.data);
    renderServicio(servicios.data);
    renderRegion(regiones.data);
    renderTopClientes(topClientes.data);
    aiuData = aiu.data;
    renderAiu(aiuData, filtroAiuMes);

    // Datos de metas para el año seleccionado
    if (metaResp && metaResp.success && metaResp.data) {
      const md = metaResp.data;
      metaAnualTotal     = parseFloat(md.metaTotalAnual) || 0;
      // Meta mensual empresa [12]
      metaMensualPorMes  = Array(12).fill(0);
      (md.distribucionMensual || []).forEach(dm => {
        metaMensualPorMes[dm.idMes - 1] = parseFloat(dm.metaMensual) || 0;
      });
      // Meta mensual por consultor {nombre: [12]}
      metaMensualPorConsultor = {};
      (md.metasConsultores || []).forEach(mc => {
        const arr = Array(12).fill(0);
        (mc.metasMensuales || []).forEach(mm => {
          arr[mm.idMes - 1] = parseFloat(mm.metaMensual) || 0;
        });
        metaMensualPorConsultor[mc.nombreConsultor] = arr;
      });
    } else {
      metaAnualTotal          = 0;
      metaMensualPorMes       = Array(12).fill(0);
      metaMensualPorConsultor = {};
    }

    forecastData = forecast.data;
    poblarDropdownConsultor(forecastData);
    renderForecast(forecastData, vistaForecast);
    renderEfectividad(efectividadResp?.data || []);

    est.textContent = '✓ Actualizado';
    setTimeout(() => { est.textContent = ''; }, 2000);

  } catch (e) {
    console.error(e);
    est.textContent = '✗ Error de conexión';
    est.style.color = 'var(--rojo)';
  }
}

/* ── Re-fetch parciales (para filtros que no recargan todo) ──── */
async function recargarServicio() {
  const anio = selectAnio.value;
  const r = await fetch(`${API}/pipeline/por-servicio?anio=${anio}&filtro=${filtroServicio}`).then(r => r.json());
  renderServicio(r.data);
}
async function recargarRegion() {
  const anio = selectAnio.value;
  const r = await fetch(`${API}/pipeline/por-region?anio=${anio}&filtro=${filtroRegion}`).then(r => r.json());
  renderRegion(r.data);
}
async function recargarClientes() {
  const anio = selectAnio.value;
  const r = await fetch(`${API}/pipeline/top-clientes?anio=${anio}&top=10&filtro=${filtroClientes}`).then(r => r.json());
  renderTopClientes(r.data);
}
async function recargarAiu() {
  const anio = selectAnio.value;
  const url  = `${API}/pipeline/aiu?anio=${anio}${filtroAiuMes > 0 ? '&mes=' + filtroAiuMes : ''}`;
  const r    = await fetch(url).then(r => r.json());
  aiuData    = r.data;
  renderAiu(aiuData, filtroAiuMes);
}

async function recargarForecast() {
  const anio = selectAnio.value;
  const r = await fetch(
    `${API}/pipeline/forecast?anio=${anio}${filtroFcConsultor ? '&consultor=' + encodeURIComponent(filtroFcConsultor) : ''}`
  ).then(r => r.json());
  forecastData = r.data;
  renderForecast(forecastData, vistaForecast);
}

/* ── Helpers de filtros 3 estados ───────────────────────────── */
function setFiltro(tipo, valor) {
  if (tipo === 'servicio')  { filtroServicio = valor; recargarServicio();  actualizarBotonesServicio(); }
  if (tipo === 'region')    { filtroRegion   = valor; recargarRegion();    actualizarBotonesRegion();   }
  if (tipo === 'clientes')  { filtroClientes = valor; recargarClientes();  actualizarBotonesClientes(); }
}
function actualizarBotonesServicio() { _setActivosFiltro('filtroServicioGroup', filtroServicio); }
function actualizarBotonesRegion()   { _setActivosFiltro('filtroRegionGroup',   filtroRegion);   }
function actualizarBotonesClientes() { _setActivosFiltro('filtroClientesGroup', filtroClientes); }

function _setActivosFiltro(groupId, valor) {
  const g = document.getElementById(groupId);
  if (!g) return;
  g.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filtro === valor);
  });
}

/* ══════════════════════════════════════════════════════════════
   KPIs
══════════════════════════════════════════════════════════════ */
function renderKpis(d) {
  if (!d) return;
  document.getElementById('kpiTotal').textContent         = d.totalOportunidades ?? 0;
  document.getElementById('kpiGanadas').textContent       = d.ganadas            ?? 0;
  document.getElementById('kpiPerdidas').textContent      = d.perdidas           ?? 0;
  document.getElementById('kpiActivas').textContent       = d.activas            ?? 0;
  document.getElementById('kpiValorPipeline').textContent = cop(d.valorPipelineActivo);
  document.getElementById('kpiValorGanado').textContent   = cop(d.valorGanado);
  document.getElementById('kpiPonderado').textContent     = cop(d.valorPonderado);
  document.getElementById('kpiWinRate').textContent       = (d.winRatePorCantidad ?? 0) + '%';
}

/* ══════════════════════════════════════════════════════════════
   FUNNEL — Embudo SVG
   CAMBIOS:
   • El % interior = porcentajeProbabilidad (de la fase), no cantidad/total
   • Fuentes considerablemente más grandes y legibles
   • Botón de pantalla completa
══════════════════════════════════════════════════════════════ */
function renderFunnel(data) {
  if (!data?.length) return;

  const container = document.getElementById('funnelSvg');
  container.innerHTML = '';

  const total = data.reduce((s, f) => s + f.cantidad, 0);
  document.getElementById('subtFunnel').textContent = `${total} oportunidades totales`;

  const VW = 860, VH = 420;
  const cx = 290;
  const fTop = 14, fH = 380;
  const maxHW = 244, minHW = 20;
  const N = data.length;
  const layerH = fH / N;

  const ns  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  /* ── Defs ── */
  const defs = document.createElementNS(ns, 'defs');
  const filter = document.createElementNS(ns, 'filter');
  filter.setAttribute('id', 'txtShadow');
  filter.setAttribute('x','-5%'); filter.setAttribute('y','-5%');
  filter.setAttribute('width','110%'); filter.setAttribute('height','120%');
  const fe = document.createElementNS(ns, 'feDropShadow');
  fe.setAttribute('dx','0'); fe.setAttribute('dy','1.5');
  fe.setAttribute('stdDeviation','1.5');
  fe.setAttribute('flood-color','rgba(0,0,0,0.55)');
  filter.appendChild(fe); defs.appendChild(filter); svg.appendChild(defs);

  data.forEach((phase, i) => {
    const t = i / N, b = (i + 1) / N;
    const twH = maxHW - (maxHW - minHW) * t;
    const bwH = maxHW - (maxHW - minHW) * b;
    const y   = fTop + i * layerH;
    const midY = y + layerH / 2;
    const color = FUNNEL_PALETTE[i % FUNNEL_PALETTE.length];

    // Trapezoide
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', `${cx-twH},${y} ${cx+twH},${y} ${cx+bwH},${y+layerH} ${cx-bwH},${y+layerH}`);
    poly.setAttribute('fill', color);
    poly.setAttribute('opacity', '0.9');
    svg.appendChild(poly);

    // Separador entre capas
    if (i < N - 1) {
      const sep = document.createElementNS(ns, 'line');
      sep.setAttribute('x1', cx - bwH); sep.setAttribute('y1', y + layerH);
      sep.setAttribute('x2', cx + bwH); sep.setAttribute('y2', y + layerH);
      sep.setAttribute('stroke', 'rgba(255,255,255,0.6)');
      sep.setAttribute('stroke-width', '2');
      svg.appendChild(sep);
    }

    // Reflejo cristal
    const shineW1 = twH * 0.2, shineW2 = bwH * 0.2;
    const shine = document.createElementNS(ns, 'polygon');
    shine.setAttribute('points',
      `${cx-twH+5},${y+4} ${cx-twH+shineW1+5},${y+4} ` +
      `${cx-bwH+shineW2+5},${y+layerH-4} ${cx-bwH+5},${y+layerH-4}`);
    shine.setAttribute('fill', 'rgba(255,255,255,0.13)');
    svg.appendChild(shine);

    /* ── Texto DENTRO — tamaños más grandes y legibles ── */
    const availW  = (twH + bwH);   // ancho promedio de la capa
    // Fuente de nombre: mínimo 11px, max 15px dependiendo del ancho
    const fszFase = Math.max(11, Math.min(15, availW / 18));
    // Fuente de % probabilidad: mínimo 10px, max 14px
    const fszPct  = Math.max(10, Math.min(14, availW / 20));
    const showBoth = layerH >= 30;

    const textY = showBoth ? midY - 7 : midY;

    // Truncar nombre según ancho disponible
    const maxChars = Math.max(8, Math.floor(availW / (fszFase * 0.52)));
    const faseCorta = phase.faseVenta.length > maxChars
      ? phase.faseVenta.slice(0, maxChars - 1) + '…'
      : phase.faseVenta;

    const tFase = document.createElementNS(ns, 'text');
    tFase.setAttribute('x', cx); tFase.setAttribute('y', textY);
    tFase.setAttribute('text-anchor', 'middle');
    tFase.setAttribute('dominant-baseline', 'middle');
    tFase.setAttribute('fill', '#fff');
    tFase.setAttribute('font-size', fszFase);
    tFase.setAttribute('font-weight', '800');
    tFase.setAttribute('font-family', 'Barlow Condensed, Barlow, sans-serif');
    tFase.setAttribute('filter', 'url(#txtShadow)');
    tFase.setAttribute('letter-spacing', '0.03em');
    tFase.textContent = faseCorta;
    svg.appendChild(tFase);

    // % Probabilidad de la fase (PorcentajeProbabilidad, NO cantidad/total)
    if (showBoth) {
      const tPct = document.createElementNS(ns, 'text');
      tPct.setAttribute('x', cx); tPct.setAttribute('y', midY + 10);
      tPct.setAttribute('text-anchor', 'middle');
      tPct.setAttribute('dominant-baseline', 'middle');
      tPct.setAttribute('fill', 'rgba(255,255,255,0.95)');
      tPct.setAttribute('font-size', fszPct);
      tPct.setAttribute('font-weight', '700');
      tPct.setAttribute('font-family', 'Barlow, sans-serif');
      tPct.setAttribute('filter', 'url(#txtShadow)');
      // ▶ Este es el porcentaje de probabilidad de la fase, no la proporción de ops
      const pctVal = phase.porcentajeProbabilidad <= 1 && phase.porcentajeProbabilidad > 0
        ? Math.round(phase.porcentajeProbabilidad * 100)
        : Math.round(phase.porcentajeProbabilidad);
      tPct.textContent = `${pctVal}%`;
      svg.appendChild(tPct);
    }

    /* ── Anotaciones FUERA (derecha) — también más legibles ── */
    const annX  = cx + maxHW + 30;
    const midRX = cx + (twH + bwH) / 2 + 2;

    const conLine = document.createElementNS(ns, 'line');
    conLine.setAttribute('x1', midRX + 3); conLine.setAttribute('y1', midY);
    conLine.setAttribute('x2', annX - 8);  conLine.setAttribute('y2', midY);
    conLine.setAttribute('stroke', color); conLine.setAttribute('stroke-width', '1.6');
    conLine.setAttribute('opacity', '0.7');
    svg.appendChild(conLine);

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', midRX + 3); dot.setAttribute('cy', midY);
    dot.setAttribute('r', '4'); dot.setAttribute('fill', color);
    svg.appendChild(dot);

    const showAnn2 = layerH >= 26;
    const ann1Y    = showAnn2 ? midY - 7 : midY;

    // Cantidad de ops — fuente 12px negrita
    const ann1 = document.createElementNS(ns, 'text');
    ann1.setAttribute('x', annX); ann1.setAttribute('y', ann1Y);
    ann1.setAttribute('dominant-baseline', 'middle');
    ann1.setAttribute('fill', '#1A2340');
    ann1.setAttribute('font-size', '12');
    ann1.setAttribute('font-weight', '800');
    ann1.setAttribute('font-family', 'Barlow, sans-serif');
    ann1.textContent = `${phase.cantidad} op${phase.cantidad !== 1 ? 's' : ''}`;
    svg.appendChild(ann1);

    // Valor mensual — fuente 11px
    if (showAnn2) {
      const ann2 = document.createElementNS(ns, 'text');
      ann2.setAttribute('x', annX); ann2.setAttribute('y', midY + 8);
      ann2.setAttribute('dominant-baseline', 'middle');
      ann2.setAttribute('fill', '#4A5568');
      ann2.setAttribute('font-size', '11');
      ann2.setAttribute('font-family', 'Barlow, sans-serif');
      ann2.textContent = cop(phase.valorMensualTotal);
      svg.appendChild(ann2);
    }
  });

  // Borde superior (elipse)
  const rim = document.createElementNS(ns, 'ellipse');
  rim.setAttribute('cx', cx); rim.setAttribute('cy', fTop);
  rim.setAttribute('rx', maxHW); rim.setAttribute('ry', 9);
  rim.setAttribute('fill', 'rgba(255,255,255,0.2)');
  rim.setAttribute('stroke', 'rgba(255,255,255,0.6)');
  rim.setAttribute('stroke-width', '2');
  svg.appendChild(rim);

  // Contorno exterior
  const outline = document.createElementNS(ns, 'polygon');
  outline.setAttribute('points',
    `${cx-maxHW},${fTop} ${cx+maxHW},${fTop} ${cx+minHW},${fTop+fH} ${cx-minHW},${fTop+fH}`);
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke', 'rgba(255,255,255,0.3)');
  outline.setAttribute('stroke-width', '2');
  svg.appendChild(outline);

  container.appendChild(svg);
}

/* ── Fullscreen del embudo ───────────────────────────────────── */
function toggleFunnelFullscreen() {
  funnelFullscreen = !funnelFullscreen;
  const wrap = document.getElementById('funnelCardWrap');
  const btn  = document.getElementById('btnFunnelFs');
  if (funnelFullscreen) {
    wrap.classList.add('funnel-fs');
    btn.innerHTML = '<i class="bi bi-fullscreen-exit me-1"></i>Salir';
    document.body.style.overflow = 'hidden';
  } else {
    wrap.classList.remove('funnel-fs');
    btn.innerHTML = '<i class="bi bi-fullscreen me-1"></i>Pantalla completa';
    document.body.style.overflow = '';
  }
}

/* ══════════════════════════════════════════════════════════════
   MODALIDAD (dona)
══════════════════════════════════════════════════════════════ */
function renderModalidad(data) {
  if (!data?.length) return;
  destroyChart('modalidad');
  const colores = [C.azul, C.naranja, C.verde, C.purpura];
  const ctx = document.getElementById('chartModalidad').getContext('2d');
  charts.modalidad = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.modalidad),
      datasets: [{ data: data.map(d => d.valorTotal), backgroundColor: colores, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${cop(ctx.raw)} · ${ctx.label}` } } }
    }
  });
  const leg = document.getElementById('legendModalidad');
  leg.innerHTML = data.map((d, i) => `
    <div class="donut-legend-item">
      <div class="donut-legend-dot" style="background:${colores[i]}"></div>
      <span class="donut-legend-name">${d.modalidad}</span>
      <span class="donut-legend-val">${d.porcentaje}%</span>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════════
   POR CONSULTOR
══════════════════════════════════════════════════════════════ */
function renderConsultor(data) {
  if (!data?.length) return;
  destroyChart('consultor');
  const labels = data.map(d => d.consultor.split(' ').slice(0, 2).join(' '));
  charts.consultor = new Chart(document.getElementById('chartConsultor').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Ganado',          data: data.map(d => d.valorGanado),   backgroundColor: C.verde,  borderRadius: { topLeft:6, topRight:6 } },
        { label: 'Pipeline activo', data: data.map(d => d.valorPipeline), backgroundColor: C.azulCl, borderRadius: { topLeft:6, topRight:6 } }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Barlow' }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${cop(ctx.raw)} — ${ctx.dataset.label}` } }
      },
      scales: {
        x: { stacked: false, grid: { display: false }, ticks: { font: { family: 'Barlow', size: 11 } } },
        y: { grid: { color: '#EEF2F8' }, ticks: { font: { family: 'Barlow' }, callback: v => cop(v) } }
      }
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   EVOLUCIÓN MENSUAL
══════════════════════════════════════════════════════════════ */
function renderEvolucion(data) {
  if (!data?.length) return;
  destroyChart('evolucion'); destroyChart('evolucionValor');
  const labels = data.map(d => d.nombreMes.slice(0, 3).toUpperCase());

  charts.evolucion = new Chart(document.getElementById('chartEvolucion').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Nuevas',  data: data.map(d => d.nuevasOportunidades), backgroundColor: C.azulCl, borderRadius: 6 },
        { label: 'Ganadas', data: data.map(d => d.ganadas),             backgroundColor: C.verde,  borderRadius: 6 },
        { label: 'Perdidas',data: data.map(d => d.perdidas),            backgroundColor: C.rojo,   borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { family: 'Barlow' }, boxWidth: 12 } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Barlow', size: 10 } } },
        y: { grid: { color: '#EEF2F8' }, ticks: { font: { family: 'Barlow' } } }
      }
    }
  });

  charts.evolucionValor = new Chart(document.getElementById('chartEvolucionValor').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Valor Nuevo',  data: data.map(d => d.valorNuevo),  borderColor: C.azulCl, backgroundColor: 'rgba(0,102,204,0.1)',  fill: true, tension: 0.35, pointRadius: 4 },
        { label: 'Valor Ganado', data: data.map(d => d.valorGanado), borderColor: C.verde,  backgroundColor: 'rgba(57,181,74,0.1)', fill: true, tension: 0.35, pointRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Barlow' }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${cop(ctx.raw)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Barlow', size: 10 } } },
        y: { grid: { color: '#EEF2F8' }, ticks: { callback: v => cop(v), font: { family: 'Barlow' } } }
      }
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   POR SERVICIO — con filtro ganada / abierta / todas
══════════════════════════════════════════════════════════════ */
function renderServicio(data) {
  if (!data?.length) { destroyChart('servicio'); return; }
  destroyChart('servicio');

  // Color según filtro activo
  const color = filtroServicio === 'ganada' ? C.verde : filtroServicio === 'abierta' ? C.azulCl : C.azulMed;

  charts.servicio = new Chart(document.getElementById('chartServicio').getContext('2d'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.servicio),
      datasets: [{ label: 'Valor/mes', data: data.map(d => d.valorTotal), backgroundColor: color, borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${cop(ctx.raw)} · ${data[ctx.dataIndex].porcentaje}%` } }
      },
      scales: {
        x: { grid: { color: '#EEF2F8' }, ticks: { callback: v => cop(v), font: { family: 'Barlow' } } },
        y: { grid: { display: false }, ticks: { font: { family: 'Barlow', size: 10 } } }
      }
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   POR REGIÓN — con filtro ganada / abierta / todas
══════════════════════════════════════════════════════════════ */
function renderRegion(data) {
  if (!data?.length) { destroyChart('region'); return; }
  destroyChart('region');

  const colorBase = filtroServicio === 'ganada' ? C.verde : C.azul;
  const colores = [C.azul, C.azulMed, C.azulCl, C.verde, C.naranja, C.purpura, C.rojo];

  charts.region = new Chart(document.getElementById('chartRegion').getContext('2d'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.region),
      datasets: [{ label: 'Valor/mes', data: data.map(d => d.valorTotal), backgroundColor: colores, borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${cop(ctx.raw)} · ${data[ctx.dataIndex].porcentaje}%` } }
      },
      scales: {
        x: { grid: { color: '#EEF2F8' }, ticks: { callback: v => cop(v), font: { family: 'Barlow' } } },
        y: { grid: { display: false }, ticks: { font: { family: 'Barlow', size: 10 } } }
      }
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   TOP CLIENTES — con filtro ganada / abierta / todas
══════════════════════════════════════════════════════════════ */
function renderTopClientes(data) {
  if (!data?.length) { destroyChart('clientes'); return; }
  destroyChart('clientes');

  charts.clientes = new Chart(document.getElementById('chartClientes').getContext('2d'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.cliente.split(' ').slice(0, 3).join(' ')),
      datasets: filtroClientes === 'ganada'
        ? [{ label: 'Valor Ganado', data: data.map(d => d.valorGanado), backgroundColor: C.verde, borderRadius: { topLeft:6, topRight:6 } }]
        : [
            { label: 'Valor Ganado', data: data.map(d => d.valorGanado),   backgroundColor: C.verde,  borderRadius: { topLeft:6, topRight:6 } },
            { label: 'Pipeline',     data: data.map(d => d.valorPipeline), backgroundColor: C.azulCl, borderRadius: { topLeft:6, topRight:6 } }
          ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Barlow' }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${cop(ctx.raw)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Barlow', size: 10 } } },
        y: { grid: { color: '#EEF2F8' }, ticks: { callback: v => cop(v), font: { family: 'Barlow' } } }
      }
    }
  });

  const tbody = document.querySelector('#tablaTopClientes tbody');
  tbody.innerHTML = data.map((d, i) => `
    <tr>
      <td style="font-weight:700;color:var(--azul)">${i + 1}</td>
      <td><strong>${d.cliente}</strong></td>
      <td style="text-align:center">${d.oportunidades}</td>
      <td style="text-align:right;font-weight:700">${(filtroClientes === 'ganada' ? cop(d.valorGanado) : cop(d.valorPipeline))}</td>
    </tr>`).join('');
}

/* ══════════════════════════════════════════════════════════════
   FORECAST MRR
   CAMBIOS:
   • Solo GANADA + TipoCliente NUEVO/PROFUNDIZACION (lógica en backend)
   • Dropdown de consultor para filtrar
══════════════════════════════════════════════════════════════ */
const MESES_ABR = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

function poblarDropdownConsultor(d) {
  if (!d) return;
  const sel = document.getElementById('selectFcConsultor');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Todos los consultores —</option>';
  (d.consultores || []).forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    if (c === prev) o.selected = true;
    sel.appendChild(o);
  });
}

function onFcConsultorChange() {
  filtroFcConsultor = document.getElementById('selectFcConsultor').value;
  recargarForecast();
}

function toggleForecast(vista) {
  vistaForecast = vista;
  document.getElementById('btnVerTotal').classList.toggle('active', vista === 'total');
  document.getElementById('btnVerFijo').classList.toggle('active',  vista === 'fijo');
  document.getElementById('btnVerOcas').classList.toggle('active',  vista === 'ocasional');
  if (forecastData) renderForecast(forecastData, vista);
}

function renderForecast(d, vista) {
  if (!d) return;

  document.getElementById('badgeForecastAnio').textContent = d.anio;
  document.getElementById('fcTotalContratos').textContent  = d.cantidadContratos ?? 0;
  document.getElementById('fcGranTotal').textContent       = cop(d.granTotal);
  document.getElementById('fcTotalFijo').textContent       = cop(d.granTotalFijo);
  document.getElementById('fcTotalOcas').textContent       = cop(d.granTotalOcas);
  document.getElementById('fcMesesPerdidos').textContent   = d.totalMesesPerdidos ?? 0;
  document.getElementById('fcValorPerdido').textContent    = cop(d.valorMesesPerdidos);

  const filaValores = fila =>
    vista === 'fijo'      ? fila.valoresFijo  :
    vista === 'ocasional' ? fila.valoresOcas  : fila.valores;

  const totalsMes =
    vista === 'fijo'      ? d.totalesMensualesFijo :
    vista === 'ocasional' ? d.totalesMensualesOcas : d.totalesMensuales;

  // ── Gráfica barras apiladas ────────────────────────────────
  destroyChart('forecast');
  const ctx = document.getElementById('chartForecast').getContext('2d');
  const datasets = d.filas.map(fila => ({
    label:           MESES_ABR[fila.mesCohorte - 1],
    data:            filaValores(fila),
    backgroundColor: C.cortes[fila.mesCohorte - 1] + 'CC',
    borderColor:     C.cortes[fila.mesCohorte - 1],
    borderWidth:     1
  }));
  charts.forecast = new Chart(ctx, {
    type: 'bar',
    data: { labels: MESES_ABR, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Barlow', size: 10 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: ctx => { if (!ctx.raw) return null; return ` ${ctx.dataset.label}: ${cop(ctx.raw)}`; },
            footer: items => `Total mes: ${cop(items.reduce((s, i) => s + i.raw, 0))}`
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Barlow', weight: '700' } } },
        y: { stacked: true, grid: { color: '#EEF2F8' }, ticks: { callback: v => cop(v), font: { family: 'Barlow' } } }
      }
    }
  });

  // ── Tabla escalera ─────────────────────────────────────────
  document.getElementById('forecastThead').innerHTML = `<tr>
    <th>Corte</th>
    ${MESES_ABR.map(m => `<th class="mes-col">${m}</th>`).join('')}
    <th class="total-col">TOTAL</th>
    <th class="acum-col">TOTAL ACUMULADO</th>
    <th class="meta-exp-col">META MENSUAL / ANUAL</th>
    <th class="cumpl-col">CUMPLIMIENTO META</th>
  </tr>`;

  const tbody = document.getElementById('forecastTbody');
  let rows = '';
  let acumuladoAnual = 0;

  d.filas.forEach(fila => {
    const vals  = filaValores(fila);
    const total = vals.reduce((s, v) => s + v, 0);
    acumuladoAnual += total;

    // META MENSUAL / ANUAL: valor directo de la distribución de metas para ese mes
    // (ej: ENE=$1,430,000,000 tal cual, sin dividir por meses restantes)
    const idxMes  = fila.mesCohorte - 1;   // 0-based
    const metaExp = metaMensualPorMes[idxMes] || 0;

    // CUMPLIMIENTO = acumulado hasta este corte / meta anual total
    const cumplPct   = metaAnualTotal > 0
      ? Math.round((acumuladoAnual / metaAnualTotal) * 100)
      : 0;
    const cumplColor = cumplPct >= 100 ? 'var(--verde-dark)' :
                       cumplPct >= 60  ? 'var(--naranja)' : 'var(--rojo)';

    rows += `<tr>
      <td>${MESES_ABR[fila.mesCohorte - 1]}</td>
      ${vals.map((v, mi) => {
        const isEmpty  = v === 0;
        const isOrigin = mi === fila.mesCohorte - 1 && v > 0;
        const cls = isEmpty ? 'celda-vacia' : isOrigin ? 'celda-origen' : 'celda-activa';
        return `<td class="${cls}">${isEmpty ? '—' : copFull(v)}</td>`;
      }).join('')}
      <td class="col-total">${copFull(total)}</td>
      <td class="col-acum">${copFull(acumuladoAnual)}</td>
      <td class="col-meta-exp">${metaExp > 0 ? copFull(metaExp) : '—'}</td>
      <td class="col-cumpl" style="color:${cumplColor};font-weight:800">${metaAnualTotal > 0 ? cumplPct + '%' : '—'}</td>
    </tr>`;
  });
  tbody.innerHTML = rows;

  const granTotal = totalsMes.reduce((s, v) => s + v, 0);
  const cumplFinalPct   = metaAnualTotal > 0 ? Math.round((granTotal / metaAnualTotal) * 100) : 0;
  const cumplFinalColor = cumplFinalPct >= 100 ? 'var(--verde-dark)' :
                          cumplFinalPct >= 60  ? 'var(--naranja)' : 'var(--rojo)';
  document.getElementById('forecastTfoot').innerHTML = `
    <tr>
      <td>TOTAL MES</td>
      ${totalsMes.map(v => `<td style="color:var(--azul-med)">${v > 0 ? copFull(v) : '—'}</td>`).join('')}
      <td class="col-total" style="color:var(--azul)">${copFull(granTotal)}</td>
      <td class="col-acum" style="color:var(--azul);font-weight:800">${copFull(granTotal)}</td>
      <td class="col-meta-exp" style="color:var(--azul);font-weight:800">${metaAnualTotal > 0 ? copFull(metaAnualTotal) : '—'}</td>
      <td class="col-cumpl" style="color:${cumplFinalColor};font-weight:800">${metaAnualTotal > 0 ? cumplFinalPct + '%' : '—'}</td>
    </tr>`;

  // ── Tabla resumen inferior (FIJO / OCASIONAL / TOTAL) ─────────────
  renderForecastResumen(d, vista);
}

/* ══════════════════════════════════════════════════════════════
   PANTALLA COMPLETA — Tabla Forecast
══════════════════════════════════════════════════════════════ */
function toggleForecastFullscreen() {
  forecastFullscreen = !forecastFullscreen;
  const wrap = document.getElementById('forecastTableWrap');
  const btn  = document.getElementById('btnForecastFs');
  if (forecastFullscreen) {
    wrap.classList.add('forecast-fs');
    btn.innerHTML = '<i class="bi bi-fullscreen-exit me-1"></i>Salir pantalla completa';
    document.body.style.overflow = 'hidden';
  } else {
    wrap.classList.remove('forecast-fs');
    btn.innerHTML = '<i class="bi bi-fullscreen me-1"></i>Pantalla completa';
    document.body.style.overflow = '';
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (forecastFullscreen) toggleForecastFullscreen();
    if (funnelFullscreen)   toggleFunnelFullscreen();
  }
});


/* ══════════════════════════════════════════════════════════════
   AIU — Análisis de Rentabilidad por mes de inicio del servicio
   Solo: GANADAS + TipoCliente NUEVO / PROFUNDIZACIÓN
   AIU ABSOLUTO = Tarifa − Costo
   %AIU = (Tarifa / AIU_ABSOLUTO) × 100
══════════════════════════════════════════════════════════════ */
function setFiltroAiuMes(mes) {
  filtroAiuMes = mes;
  document.querySelectorAll('.aiu-mes-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.mes) === mes);
  });
  recargarAiu();
}

function renderAiu(d, mes) {
  if (!d) return;
  const mensual = d.mensual || [];

  const tbody = document.getElementById('tbodyAiu');
  if (!tbody) return;
  tbody.innerHTML = mensual.map(m => {
    const hasDatos = m.cantidad > 0;
    // %AIU = (Tarifa / AIU_ABSOLUTO) × 100
    const pctAiu   = hasDatos && m.aiuAbsoluto > 0
                     ? (m.aiuAbsoluto / m.totalTarifa) * 100
                     : 0;
    // Umbrales ajustados: con esta fórmula valores típicos son >10% & <10%
    const pctColor = !hasDatos
  ? 'var(--gris-med)'
  : pctAiu <= 10
    ? 'var(--rojo)'
    : pctAiu <= 11
      ? 'var(--verde)'
      : 'var(--verde-dark)';
    const esMesSel = mes > 0 && mes === m.mes;
    return `<tr${esMesSel ? ' class="aiu-row-sel"' : ''}>
      <td><strong>${m.nombreMes}</strong></td>
      <td style="text-align:right">${hasDatos ? m.cantidad : '—'}</td>
      <td style="text-align:right;color:var(--azul-med);font-weight:600">${hasDatos ? copFull(m.totalTarifa) : '—'}</td>
      <td style="text-align:right;color:var(--rojo)">${hasDatos ? copFull(m.totalCosto) : '—'}</td>
      <td style="text-align:right;color:var(--gris-med)">${hasDatos ? copFull(m.aiuAbsoluto) : '—'}</td>
      <td style="text-align:right;font-weight:700">${hasDatos ? copFull(m.totalCotizacion) : '—'}</td>
      <td style="text-align:center;font-weight:800;font-size:1.05em;color:${pctColor}">${hasDatos ? pctAiu.toFixed(2) + '%' : '—'}</td>
    </tr>`;
  }).join('');

  const tfoot = document.getElementById('tfootAiu');
  if (tfoot) {
    // %AIU = (Tarifa / AIU_ABSOLUTO)
    const pct = d.aiuAbsoluto > 0 ? (d.aiuAbsoluto / d.totalTarifa) * 100 : 0;
    // FIX: hasDatos y pctAiu solo existen en el scope del .map() de tbody.
    // Se usan las variables del nivel del total: d.cantidad y pct.
    const pctColor = d.cantidad <= 0
      ? 'var(--gris-med)'
      : pct <= 10
        ? 'var(--rojo)'
        : pct <= 11
          ? 'var(--verde)'
          : 'var(--verde-dark)';
    const label = mes > 0
      ? (mensual.find(m2 => m2.mes === mes)?.nombreMes ?? 'Mes') + ' — Total'
      : 'TOTAL AÑO';
    tfoot.innerHTML = `<tr class="aiu-tfoot-row">
      <td><strong>${label}</strong></td>
      <td style="text-align:right">${d.cantidad}</td>
      <td style="text-align:right;color:var(--azul-med)">${copFull(d.totalTarifa)}</td>
      <td style="text-align:right;color:var(--rojo)">${copFull(d.totalCosto)}</td>
      <td style="text-align:right;color:var(--gris-med)">${copFull(d.aiuAbsoluto)}</td>
      <td style="text-align:right;font-weight:700">${copFull(d.totalCotizacion)}</td>
      <td style="text-align:center;font-weight:800;font-size:1.1em;color:${pctColor}">${pct.toFixed(2)}%</td>
    </tr>`;
  }
}

/* ── Tabla resumen inferior del Forecast ────────────────────────
   FIJO / OCASIONAL / TOTAL — valores de venta nueva (diagonal)
── */
function renderForecastResumen(d, vista) {
  const tbody = document.getElementById('forecastResumenBody');
  if (!tbody || !d) return;

  const vF   = d.ventaNuevaMesFijo || new Array(12).fill(0);
  const vO   = d.ventaNuevaMesOcas || new Array(12).fill(0);
  const vTot = d.ventaNuevaMes     || new Array(12).fill(0);

  const totF = vF.reduce((s, v) => s + v, 0);
  const totO = vO.reduce((s, v) => s + v, 0);
  const totT = vTot.reduce((s, v) => s + v, 0);

  // ── Meta mensual por mes: empresa o consultor filtrado ──────────────
  // META MENSUAL ESCALERA: metaMensual[mes] / mesesRestantes_incluyendo_ese_mes
  // ENE: $1,430M / 12 = $119.166.667 | FEB: $1,430M / 11 = $130.000.000 ...
  let baseMeta = metaMensualPorMes;  // [12] empresa por defecto
  if (filtroFcConsultor && metaMensualPorConsultor[filtroFcConsultor]) {
    baseMeta = metaMensualPorConsultor[filtroFcConsultor];
  }
  const metaEscalera = baseMeta.map((m, i) => {
    const mesesRest = 12 - i;   // ENE=12, FEB=11, MAR=10 … DIC=1
    return mesesRest > 0 ? m / mesesRest : 0;
  });
  const totMeta = baseMeta.reduce((s, v) => s + v, 0);  // total = suma directa (meta anual)

  const cf   = v => v > 0 ? `<td class="res-cell fijo">${copFull(v)}</td>` : `<td class="res-cell res-vacia">—</td>`;
  const co   = v => v > 0 ? `<td class="res-cell ocas">${copFull(v)}</td>` : `<td class="res-cell res-vacia">—</td>`;
  const ct   = v => v > 0 ? `<td class="res-cell total">${copFull(v)}</td>` : `<td class="res-cell res-vacia">—</td>`;
  const cm   = v => v > 0 ? `<td class="res-cell meta">${copFull(v)}</td>` : `<td class="res-cell res-vacia">—</td>`;

  // Cumplimiento por mes: total ventas nuevas / meta exponencial del mes
  const cumplMes = vTot.map((v, i) => {
    const m = metaEscalera[i];
    if (!m || m <= 0) return null;
    return Math.round((v / m) * 100);
  });
  const cumplTotal = totMeta > 0 ? Math.round((totT / totMeta) * 100) : null;

  const cumpColor = pct => pct === null ? 'var(--gris-med)' :
    pct >= 100 ? 'var(--verde-dark)' : pct >= 60 ? 'var(--naranja)' : 'var(--rojo)';

  const cc = (pct) => pct === null
    ? `<td class="res-cell res-vacia">—</td>`
    : `<td class="res-cell cumpl" style="color:${cumpColor(pct)}">${pct}%</td>`;

  let rows = '';

  // ── Fila: META MENSUAL VENTA NUEVA ──────────────────────────────────
  rows += `<tr>
    <td class="res-lbl meta-lbl">META MENSUAL<br>VENTA NUEVA</td>
    ${metaEscalera.map(cm).join('')}
    <td class="res-cell res-total-col meta">${totMeta > 0 ? copFull(totMeta) : '—'}</td>
  </tr>`;

  // ── Filas de ventas ────────────────────────────────────────────────
  if (vista === 'total' || vista === 'fijo') {
    rows += `<tr>
      <td class="res-lbl fijo-lbl">VENTA SERVICIOS<br>NUEVOS/FIJOS</td>
      ${vF.map(cf).join('')}
      <td class="res-cell res-total-col fijo">${totF > 0 ? copFull(totF) : '—'}</td>
    </tr>`;
  }
  if (vista === 'total' || vista === 'ocasional') {
    rows += `<tr>
      <td class="res-lbl ocas-lbl">VENTA SERVICIOS<br>NUEVOS/OCASIONALES</td>
      ${vO.map(co).join('')}
      <td class="res-cell res-total-col ocas">${totO > 0 ? copFull(totO) : '—'}</td>
    </tr>`;
  }
  if (vista === 'total') {
    rows += `<tr>
      <td class="res-lbl total-lbl">TOTAL</td>
      ${vTot.map(ct).join('')}
      <td class="res-cell res-total-col total">${totT > 0 ? copFull(totT) : '—'}</td>
    </tr>`;
  }

  // ── Fila: CUMPLIMIENTO DE META ─────────────────────────────────────
  rows += `<tr>
    <td class="res-lbl cumpl-lbl">CUMPLIMIENTO<br>DE META</td>
    ${cumplMes.map(cc).join('')}
    <td class="res-cell res-total-col cumpl" style="color:${cumpColor(cumplTotal)}">${cumplTotal !== null ? cumplTotal + '%' : '—'}</td>
  </tr>`;

  tbody.innerHTML = rows;
}


/* ══════════════════════════════════════════════════════════════
   EFECTIVIDAD DE OFERTAS
══════════════════════════════════════════════════════════════ */
function renderEfectividad(data) {
  const tbody = document.getElementById('efectividadBody');
  if (!tbody) return;

  // Umbrales de color (igual imagen de referencia)
  //   ≤ 10%          → ROJO  (no cumple)
  //   10.1% - 11%    → VERDE claro (cumple)
  //   > 11%          → VERDE oscuro (supera)
  const colorPct = pct => {
    if (pct <= 10)  return { bg: '#D93025', label: 'NO CUMPLE',  text: '#fff' };
    if (pct <= 11)  return { bg: '#5CB85C', label: 'CUMPLE',     text: '#fff' };
    return               { bg: '#2A8C38', label: 'SUPERA',     text: '#fff' };
  };

  const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  if (!data || !data.length) {
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;color:#8896B0;padding:24px">
      Sin datos de efectividad para el período seleccionado.</td></tr>`;
    return;
  }

  // Construir mapa por mes para llenar todos los 12 meses
  const mapa = {};
  data.forEach(d => { mapa[d.mes || d.Mes] = d; });

  let rows = '';
  let sumPct = 0; let countMes = 0;

  MESES_FULL.forEach((nombre, i) => {
    const mes  = i + 1;
    const row  = mapa[mes];
    if (!row) {
      rows += `<tr>
        <td class="efect-periodo">${nombre}</td>
        <td class="efect-resultado efect-sin-datos">—</td>
      </tr>`;
      return;
    }
    const pct   = parseFloat(row.efectividadPct ?? row.EfectividadPct ?? 0);
    const col   = colorPct(pct);
    sumPct += pct; countMes++;
    rows += `<tr>
      <td class="efect-periodo">${nombre}</td>
      <td class="efect-resultado">
        <span class="efect-pill" style="background:${col.bg};color:${col.text}">
          ${pct.toFixed(1)}%
        </span>
        <span class="efect-label" style="color:${col.bg}">${col.label}</span>
      </td>
    </tr>`;
  });

  // Promedio / acumulado
  const promedio = countMes > 0 ? (sumPct / countMes).toFixed(1) : 0;
  const colProm  = colorPct(parseFloat(promedio));
  rows += `<tr class="efect-promedio-row">
    <td class="efect-periodo"><strong>PROMEDIO / ACUMULADO</strong></td>
    <td class="efect-resultado">
      <span class="efect-pill efect-pill-lg" style="background:${colProm.bg};color:${colProm.text}">
        ${promedio}%
      </span>
    </td>
  </tr>`;

  tbody.innerHTML = rows;
}

/* ══════════════════════════════════════════════════════════════
   ARRANQUE
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  Chart.defaults.font.family = 'Barlow';
  Chart.defaults.color       = '#6B7A9A';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  cargarTodo();
});