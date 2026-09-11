/* ================================================================
   logicaactualizar.js — CRM Honor · Consultar / Actualizar
   [v4] Se agrega el catálogo y selector opcional de Modalidad,
   para poder completarla en oportunidades que fueron creadas en
   fase de Contacto (sin modalidad asignada) y ahora avanzan.
   ================================================================ */

const API = 'http://localhost:5000/api';
let cotizacionActiva      = null;
let idOportunidadActiva   = null;
let tiempoMesesActiva      = 0;
let idModalidadActiva      = 0;   // [v5] modalidad vigente de la oportunidad abierta
let catalogoFases          = [];
let ordenFaseActiva        = 0;   // OrdenFunnel de la fase vigente
let idFaseActiva           = 0;   // IdFaseVenta vigente
let catalogoConsultores   = [];
let catalogoModalidades   = [];
// [M-1] La grilla ya no guarda el dataset completo: solo la página visible.
// El filtrado y la paginación se resuelven en el servidor.
let paginaActual = [];            // filas de la página que se está viendo

const estadoGrilla = {
  buscar:       '',
  fase:         '',
  estado:       '',
  pagina:       1,
  tamano:       25,
  total:        0,
  totalPaginas: 0
};
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

// [v5] La visibilidad de los enlaces del navbar/sidebar la resuelve
//      guard-sesion.js segun la matriz PERMISOS. No duplicar reglas aqui.
const rol = (window.CRM_SESION && window.CRM_SESION.rol) ||
            (sessionStorage.getItem('crm_rol') || '').toUpperCase();
const esAdmin      = rol === 'ADMIN';
const esSupervisor = rol === 'SUPERVISOR';
const verTodos     = esAdmin || esSupervisor;

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

/* ══════════════════════════════════════════════════════════════════
   [v9] FLUJO POR FASE DEL FORMULARIO DE ACTUALIZACIÓN
   ──────────────────────────────────────────────────────────────────
   1. El usuario elige la fase (paso 1).
   2. Recién ahí se despliega el paso 2 con las tarjetas.
   3. Cada tarjeta se abre o se queda plegada según lo que exija la
      fase. La exigencia NO está escrita aquí: viene del catálogo
      (FaseVenta.RequiereDatosComerciales), así que cambiarla es un
      UPDATE en la base, no tocar este archivo.
══════════════════════════════════════════════════════════════════ */

// Tarjetas que la fase vuelve obligatorias cuando exige datos comerciales.
const TARJETAS_COMERCIALES = ['upValorMensual', 'upTiempoMeses', 'upMesInicioServicio'];

function faseSeleccionadaObj() {
  const id = parseInt(document.getElementById('upFaseVenta').value) || 0;
  return catalogoFases.find(f => f.id === id) || null;
}

function faseExigeDatos() {
  const f = faseSeleccionadaObj();
  return !!(f && (f.requiereDatosComerciales ?? f.RequiereDatosComerciales));
}

// [v9] Fases que exigen N° de cotización (FaseVenta.RequiereCotizacion).
function faseExigeCotizacion() {
  const f = faseSeleccionadaObj();
  return !!(f && (f.requiereCotizacion ?? f.RequiereCotizacion));
}

function fasePermiteDesdeCualquiera(f) {
  return !!(f && (f.permiteDesdeCualquierFase ?? f.PermiteDesdeCualquierFase));
}

// Abre o pliega una tarjeta desplegable.
function toggleAcordeon(header) {
  const card = header.closest('[data-acordeon]');
  if (card) card.classList.toggle('abierto');
}

function abrirAcordeon(card, abrir) {
  if (card) card.classList.toggle('abierto', !!abrir);
}

// Marca el estado de cada tarjeta y despliega las que la fase exige.
function onFaseActualizarSeleccionada() {
  const paso2 = document.getElementById('upPaso2');
  const fase  = faseSeleccionadaObj();

  if (!fase) { paso2.style.display = 'none'; return; }

  paso2.style.display = 'block';

  const exige = faseExigeDatos();
  const sub   = document.getElementById('upPaso2Sub');
  if (sub) {
    sub.textContent = exige
      ? `${fase.descripcion} exige la información comercial completa: valores, contrato y vigencia quedan abiertos y son obligatorios. El resto es opcional.`
      : 'Abre solo las tarjetas que vayas a modificar. Los campos ya traen la información actual: lo que no toques se queda como está.';
  }

  // [v9] El N° de cotización se vuelve obligatorio si la fase lo exige y la
  //      oportunidad todavía no lo tiene.
  const exigeCot = faseExigeCotizacion();
  const hintCot  = document.getElementById('upHintCotizacion');
  if (hintCot) {
    hintCot.innerHTML = exigeCot && !cotizacionActiva
      ? '<i class="bi bi-exclamation-circle me-1"></i>Obligatorio en esta fase'
      : '<i class="bi bi-info-circle me-1"></i>Deja vacío para no modificar el número actual';
  }

  document.querySelectorAll('[data-acordeon]').forEach(card => {
    // Una tarjeta es obligatoria si contiene alguno de los campos comerciales
    // y la fase los exige.
    const esComercial = TARJETAS_COMERCIALES.some(id => card.querySelector('#' + id));
    const requerida   = exige && esComercial;

    const estado = card.querySelector('.acordeon-estado');
    if (estado) {
      estado.textContent = requerida ? 'REQUERIDO' : 'OPCIONAL';
      estado.className   = 'acordeon-estado ' + (requerida ? 'es-requerido' : 'es-opcional');
    }
    card.classList.toggle('requerido', requerida);
    abrirAcordeon(card, requerida);
  });

  // La observación siempre se pide: es la bitácora del movimiento.
  const obs = document.getElementById('upObservacion');
  if (obs) {
    const card = obs.closest('[data-acordeon]');
    const est  = card?.querySelector('.acordeon-estado');
    if (est) { est.textContent = 'REQUERIDO'; est.className = 'acordeon-estado es-requerido'; }
    abrirAcordeon(card, true);
  }

  setTimeout(() => paso2.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

/* ══════════════════════════════════════════════════════════════════
   [v9] ESTADO DE CADA CAMPO: "Sin modificar" / "Vacío" / "Modificado"
   ──────────────────────────────────────────────────────────────────
   El formulario llega precargado con lo que la oportunidad ya tiene.
   El usuario necesita distinguir tres cosas de un vistazo: lo que ya
   estaba y no ha tocado, lo que nunca se diligenció, y lo que acaba
   de cambiar. Se marca con una etiqueta junto al campo.
══════════════════════════════════════════════════════════════════ */

// Campos del formulario que llevan marca de estado.
const CAMPOS_MARCABLES = [
  'upNumeroCotizacion', 'upTiempoMeses', 'upIdModalidad', 'upIdServicio', 'upNit',
  'upMesInicioServicio', 'upFechaInicioServicio', 'upIdMunicipio',
  'upValorMensual', 'upCosto'
];

function marcaDe(el) {
  let m = el.parentElement.querySelector('.campo-marca');
  if (!m) {
    m = document.createElement('span');
    m.className = 'campo-marca';
    el.parentElement.appendChild(m);
  }
  return m;
}

function pintarMarca(el, tipo) {
  const m = marcaDe(el);
  const txt = { original: '— Sin modificar —', vacio: '— Vacío —', cambiado: 'Modificado' };
  m.textContent = txt[tipo] || '';
  m.className   = 'campo-marca marca-' + tipo;
}

// Se llama al cargar el detalle: guarda el valor original de cada campo.
function inicializarMarcas() {
  CAMPOS_MARCABLES.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.dataset.valorOriginal = el.value || '';
    pintarMarca(el, el.value ? 'original' : 'vacio');

    if (!el.dataset.marcaLigada) {
      el.dataset.marcaLigada = '1';
      const revisar = () => {
        const orig = el.dataset.valorOriginal || '';
        if ((el.value || '') === orig) pintarMarca(el, orig ? 'original' : 'vacio');
        else                            pintarMarca(el, 'cambiado');
      };
      el.addEventListener('input',  revisar);
      el.addEventListener('change', revisar);
    }
  });
}

// [v10] Deja solo dígitos y recorta al máximo permitido. Se aplica en cada
// tecla y en cada pegado: el atributo maxlength por sí solo no impide pegar.
function soloDigitos(el, max) {
  el.value = (el.value || '').replace(/\D/g, '').slice(0, max);
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
    const [fases, consultores, servicios, municipios, modalidades] = await Promise.all([
      fetch(`${API}/catalogos/fases-venta`).then(r => r.json()),
      fetch(`${API}/catalogos/consultores`).then(r => r.json()),
      fetch(`${API}/catalogos/servicios`).then(r => r.json()),
      // [v11] Municipios NO va aquí: son más de mil filas que solo hacen falta
      // al abrir una oportunidad. Cargarlas en el arranque competía con la
      // consulta de la grilla y es una de las causas de la carga lenta.
      Promise.resolve({ data: [] }),
      fetch(`${API}/catalogos/modalidades`).then(r => r.json()),
    ]);
    catalogoFases       = fases.data       || [];
    catalogoConsultores = consultores.data || [];
    todosLosServicios   = servicios.data   || [];
    todosLosMunicipios  = municipios.data  || [];
    catalogoModalidades = modalidades.data || [];

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

    // Poblar selector de modalidad en formulario actualizar (opcional)
    const selModalidad = document.getElementById('upIdModalidad');
    if (selModalidad) {
      selModalidad.innerHTML = '<option value="">— Sin cambio —</option>';
      catalogoModalidades.forEach(m => {
        const o = document.createElement('option');
        o.value = m.id; o.textContent = m.descripcion;
        selModalidad.appendChild(o);
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
        const maxMes = maxMesesModalidadUp() || 72;   // [v5] tope del catálogo
        const v = parseInt(this.value) || 0;
        if (v > maxMes) {
          this.value = maxMes;
          toast(`Máximo ${maxMes} meses para esta modalidad.`, 'err');
        }
        if (v < 1 && this.value !== '') { this.value = 1; }
        tiempoMesesActiva = parseInt(this.value) || 0;
        calcularMesFinActualizar();
        calcularFechaFinActualizar();
      });
    }

    // [v5] Al cambiar la modalidad se reajusta el tope de meses al vuelo.
    const elMod = document.getElementById('upIdModalidad');
    if (elMod) elMod.addEventListener('change', () => aplicarLimiteMesesUp(true));

  } catch (e) { toast('Error cargando catálogos.', 'err'); }
}

// ── [v5] TOPE DE MESES SEGÚN MODALIDAD ─────────────────────────────────
// El límite vive en la BD (CRM.ModalidadContrato.MaxMeses) y llega en el
// catálogo. Aquí no hay ningún número de meses escrito a mano.
function maxMesesModalidadUp() {
  const sel = document.getElementById('upIdModalidad');
  const id  = parseInt(sel?.value) || 0;

  // Si el usuario no cambió la modalidad, se usa la que ya tiene la oportunidad.
  const idEfectivo = id || idModalidadActiva;
  if (!idEfectivo) return null;

  const m = catalogoModalidades.find(x => x.id === idEfectivo);
  return (m && m.maxMeses) ? m.maxMeses : null;
}

function aplicarLimiteMesesUp(avisar = false) {
  const tope   = maxMesesModalidadUp();
  const maxMes = tope || 72;
  const input  = document.getElementById('upTiempoMeses');
  if (!input) return;

  input.max = maxMes;

  if ((parseInt(input.value) || 0) > maxMes) {
    input.value       = maxMes;
    tiempoMesesActiva = maxMes;
    calcularMesFinActualizar();
    calcularFechaFinActualizar();
    if (avisar) toast(`Máximo ${maxMes} meses para esta modalidad.`, 'err');
  }

  const hint = document.getElementById('upHintTiempoMeses');
  if (hint) {
    hint.innerHTML = `<i class="bi bi-info-circle me-1"></i>Máximo ${maxMes} meses`;
  }
}

// ── FILTRO MUNICIPIO (formulario actualizar) ────────────────────────────
// [v11] Trae el catálogo de municipios la primera vez que hace falta.
let cargandoMunicipios = null;
async function asegurarMunicipios() {
  if (todosLosMunicipios.length) return;
  if (!cargandoMunicipios) {
    cargandoMunicipios = fetchJson(`${API}/catalogos/municipios`)
      .then(r => { todosLosMunicipios = r.data || []; })
      .catch(() => { toast('No se pudo cargar el listado de municipios.', 'err'); })
      .finally(() => { cargandoMunicipios = null; });
  }
  await cargandoMunicipios;
}

async function filtrarMunicipiosUp() {
  await asegurarMunicipios();
  filtrarMunicipiosUpSync();
}

function filtrarMunicipiosUpSync() {
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
  titulo.textContent = verTodos ? 'Todas las Oportunidades' : `Mis Oportunidades — ${usuario}`;

  try {
    // [M-1] Búsqueda, filtros y paginación viajan al servidor. Antes se
    // descargaba la tabla completa y se filtraba en JavaScript: con miles de
    // oportunidades eso se degrada y aparece como "la aplicación está lenta".
    //
    // [v10] El consultor también se filtra en el servidor: un consultor no
    // debe recibir el pipeline de sus compañeros ni para descartarlo después.
    const p = new URLSearchParams({
      pagina: estadoGrilla.pagina,
      tamano: estadoGrilla.tamano
    });
    if (!verTodos)            p.set('consultor', usuario);
    if (estadoGrilla.buscar)  p.set('buscar', estadoGrilla.buscar);
    if (estadoGrilla.fase)    p.set('fase', estadoGrilla.fase);
    if (estadoGrilla.estado)  p.set('estado', estadoGrilla.estado);

    // [v11] Carga tolerante a fallos: un error o un timeout no se puede
    // confundir con "no hay resultados".
    const res  = await fetchConReintento(`${API}/oportunidades?${p}`);
    const data = res.data || {};

    paginaActual              = data.items        || [];
    estadoGrilla.total        = data.total        || 0;
    estadoGrilla.totalPaginas = data.totalPaginas || 0;

    // Si se borraron filas y la página actual quedó fuera de rango, se
    // retrocede en vez de mostrar una tabla vacía sin explicación.
    if (estadoGrilla.pagina > estadoGrilla.totalPaginas && estadoGrilla.totalPaginas > 0) {
      estadoGrilla.pagina = estadoGrilla.totalPaginas;
      return cargarGrilla();
    }

    renderGrilla(paginaActual);
    renderPaginacion();

  } catch (e) {
    mostrarErrorGrilla(e.message || 'No se pudo conectar con el servidor.');
  }
}

/* ══════════════════════════════════════════════════════════════════
   [M-1] FILTROS Y PAGINACIÓN
   ──────────────────────────────────────────────────────────────────
   Cualquier cambio de filtro vuelve a la página 1: quedarse en la
   página 7 de un resultado que ahora tiene 2 páginas es el bug
   clásico de las grillas paginadas.
══════════════════════════════════════════════════════════════════ */

let relojBusqueda = null;

// La búsqueda se manda 350 ms después de la última tecla, no en cada una.
function buscarGrillaDebounce() {
  const input = document.getElementById('inputBusqueda');
  document.getElementById('btnLimpiarBusqueda').style.display = input.value ? 'flex' : 'none';

  clearTimeout(relojBusqueda);
  relojBusqueda = setTimeout(aplicarFiltros, 350);
}

function aplicarFiltros() {
  estadoGrilla.buscar = document.getElementById('inputBusqueda').value.trim();
  estadoGrilla.fase   = document.getElementById('filtroFase').value;
  estadoGrilla.estado = document.getElementById('filtroEstado').value;
  estadoGrilla.pagina = 1;
  cargarGrilla();
}

function irAPagina(n) {
  const destino = Math.min(Math.max(1, n), Math.max(1, estadoGrilla.totalPaginas));
  if (destino === estadoGrilla.pagina) return;
  estadoGrilla.pagina = destino;
  cargarGrilla();
  document.getElementById('cardGrilla')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cambiarTamano() {
  estadoGrilla.tamano = parseInt(document.getElementById('pagTamano').value) || 25;
  estadoGrilla.pagina = 1;
  cargarGrilla();
}

function renderPaginacion() {
  const cont = document.getElementById('grillaPaginacion');
  if (!cont) return;

  const { pagina, tamano, total, totalPaginas } = estadoGrilla;

  if (total === 0) { cont.style.display = 'none'; return; }
  cont.style.display = 'flex';

  const desde = (pagina - 1) * tamano + 1;
  const hasta = Math.min(pagina * tamano, total);

  document.getElementById('pagInfo').textContent   = `Mostrando ${desde}–${hasta} de ${total}`;
  document.getElementById('pagActual').textContent = `${pagina} / ${totalPaginas}`;

  document.getElementById('pagPrimera').disabled   = pagina <= 1;
  document.getElementById('pagAnterior').disabled  = pagina <= 1;
  document.getElementById('pagSiguiente').disabled = pagina >= totalPaginas;
  document.getElementById('pagUltima').disabled    = pagina >= totalPaginas;
}

/* ══════════════════════════════════════════════════════════════════
   [v11] CARGA TOLERANTE A FALLOS
   ──────────────────────────────────────────────────────────────────
   Tres problemas que producían la pantalla vacía intermitente:
     · Una respuesta con success:false se leía como "cero resultados".
     · Una petición colgada dejaba el "Cargando..." para siempre, sin
       timeout que la cortara.
     · Un fallo puntual de red no se reintentaba nunca.
══════════════════════════════════════════════════════════════════ */

const TIMEOUT_MS = 20000;

async function fetchJson(url, opciones = {}) {
  const ctrl  = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opciones, signal: ctrl.signal });
    if (!r.ok) throw new Error(`El servidor respondió ${r.status}.`);
    const json = await r.json();
    if (json && json.success === false)
      throw new Error(json.message || 'El servidor rechazó la consulta.');
    return json;
  } catch (e) {
    if (e.name === 'AbortError')
      throw new Error('El servidor tardó demasiado en responder.');
    throw e;
  } finally {
    clearTimeout(reloj);
  }
}

// Un reintento con espera corta: cubre el fallo puntual sin castigar
// al usuario con esperas largas cuando el servidor está realmente caído.
async function fetchConReintento(url, opciones = {}) {
  try {
    return await fetchJson(url, opciones);
  } catch (primerFallo) {
    await new Promise(r => setTimeout(r, 700));
    try {
      return await fetchJson(url, opciones);
    } catch (_) {
      throw primerFallo;
    }
  }
}

// Estado de error con botón de reintento: nunca una grilla vacía silenciosa.
function mostrarErrorGrilla(mensaje) {
  document.getElementById('grillaLoading').style.display = 'none';
  const wrap = document.getElementById('grillaWrap');
  wrap.style.display = 'block';

  const tbody = document.getElementById('grillaBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr><td colspan="8" style="padding:28px;text-align:center">
        <div style="color:#D93025;font-weight:700;margin-bottom:6px">
          <i class="bi bi-exclamation-triangle me-1"></i>No se pudieron cargar las oportunidades
        </div>
        <div style="color:#8896B0;font-size:0.85rem;margin-bottom:14px">${mensaje}</div>
        <button class="btn btn-primary" onclick="cargarGrilla()">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </td></tr>`;
  }
  const badge = document.getElementById('grillaBadge');
  if (badge) badge.textContent = '— oportunidades';
}

// ── RENDERIZAR GRILLA ─────────────────────────────────────────────
function renderGrilla(opps) {
  document.getElementById('grillaLoading').style.display = 'none';
  document.getElementById('grillaWrap').style.display    = 'block';

  // El badge muestra el TOTAL del servidor, no el de la página visible.
  const tot = estadoGrilla.total;
  document.getElementById('grillaBadge').textContent = `${tot} oportunidad${tot !== 1 ? 'es' : ''}`;

  const tbody    = document.getElementById('grillaBody');
  const noData   = document.getElementById('grillaVacia');

  if (!opps.length) {
    tbody.innerHTML = '';
    noData.style.display = 'flex';
    renderPaginacion();
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
// [M-1] filtrarGrilla() ya no filtra en memoria: los filtros se resuelven en
// el servidor. Se conserva el nombre porque otras partes del archivo lo llaman
// tras guardar un movimiento, y ahora simplemente recarga la página vigente.
function filtrarGrilla() {
  aplicarFiltros();
}

function limpiarBusqueda() {
  document.getElementById('inputBusqueda').value = '';
  document.getElementById('btnLimpiarBusqueda').style.display = 'none';
  clearTimeout(relojBusqueda);
  aplicarFiltros();
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
  idModalidadActiva   = 0;

  // [v9] Vuelve al paso 1: sin fase elegida no hay formulario.
  const p2 = document.getElementById('upPaso2');
  if (p2) p2.style.display = 'none';
  document.querySelectorAll('[data-acordeon]').forEach(c => c.classList.remove('abierto', 'requerido'));
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
      <div class="kpi-sub">${cab.tiempoMeses ?? '—'} meses</div>
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
    <div class="info-item"><div class="lbl">Modalidad</div><div class="val">${cab.modalidadContrato || '<em style="color:#8896B0;font-style:italic">Sin asignar</em>'}</div></div>
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

      // [G-2] Movimientos revertidos. El parche v8 guardaba la traza completa
      // pero el historial no la mostraba: un movimiento anulado se veía igual
      // que uno válido y no había forma de auditar la corrección.
      const anulado    = !!resolveHistField(m, 'anulado', 'Anulado');
      const anuladoPor = resolveHistField(m, 'usuarioAnulacion', 'UsuarioAnulacion') || '—';
      const anuladoEl  = resolveHistField(m, 'fechaAnulacion',   'FechaAnulacion');
      const motivo     = resolveHistField(m, 'motivoAnulacion',  'MotivoAnulacion') || '';

      const avisoAnulado = anulado ? `
        <div class="tc-anulado">
          <div class="tc-anulado-titulo">
            <i class="bi bi-x-octagon-fill"></i> Movimiento anulado
          </div>
          <div class="tc-anulado-detalle">
            Revertido por <strong>${anuladoPor}</strong>${anuladoEl ? ` · ${fmtFecha(anuladoEl)}` : ''}
          </div>
          ${motivo ? `<div class="tc-anulado-motivo">Motivo: ${motivo}</div>` : ''}
        </div>` : '';

      return `
      <div class="timeline-item ${anulado ? 'anulado' : (vigente ? 'vigente' : '')}">
        <div class="timeline-card ${anulado ? 'anulado' : (vigente ? 'vigente' : '')}">
          <div class="tc-header">
            <span class="tc-fase">${fase}</span>
            <div style="display:flex;align-items:center;gap:8px">
              ${anulado ? '<span class="anulado-tag">ANULADO</span>'
                        : (vigente ? '<span class="vigente-tag">VIGENTE</span>' : '')}
              <span class="tc-fecha">${fmtFecha(fecha)} — ${consultor}</span>
            </div>
          </div>
          ${avisoAnulado}
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

  // [v9] Pre-llenar servicio por Id (la vista expone idServicio desde v5).
  //      Comparar por texto fallaba con tildes o mayúsculas distintas.
  const selServ = document.getElementById('upIdServicio');
  if (selServ) {
    const idServ = parseInt(cab.idServicio || 0) || 0;
    selServ.selectedIndex = 0;
    if (idServ) {
      const opt = Array.from(selServ.options).find(o => parseInt(o.value) === idServ);
      if (opt) selServ.value = opt.value;
    }
  }

  // Pre-llenar municipio actual para que no se pierda al no tocarlo.
  const selMun = document.getElementById('upIdMunicipio');
  if (selMun && cab.idMunicipio && cab.ciudad) {
    selMun.innerHTML = `<option value="${cab.idMunicipio}">${cab.ciudad}</option>`;
    selMun.value = String(cab.idMunicipio);
  }

  // [v5] Pre-llenar modalidad por Id (la vista ya expone idModalidad).
  //      Antes se comparaba por texto, lo que fallaba con tildes o mayúsculas.
  idModalidadActiva = parseInt(cab.idModalidad || 0) || 0;

  const selModal  = document.getElementById('upIdModalidad');
  const hintModal = document.getElementById('upHintModalidad');
  if (selModal) {
    selModal.selectedIndex = 0;
    if (idModalidadActiva) {
      const opt = Array.from(selModal.options).find(o => parseInt(o.value) === idModalidadActiva);
      if (opt) selModal.value = opt.value;
      if (hintModal) hintModal.innerHTML = '<i class="bi bi-info-circle me-1"></i>Opcional · selecciona solo si deseas cambiarla';
    } else if (hintModal) {
      hintModal.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i>Esta oportunidad no tiene modalidad asignada — selecciónala si ya se conoce';
    }
  }

  // Ajusta el tope de meses a la modalidad de esta oportunidad.
  aplicarLimiteMesesUp();

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

  // [v9] El paso 2 arranca oculto: primero se elige la fase.
  const selFaseUp = document.getElementById('upFaseVenta');
  if (selFaseUp) selFaseUp.selectedIndex = 0;
  const paso2 = document.getElementById('upPaso2');
  if (paso2) paso2.style.display = 'none';
  document.querySelectorAll('[data-acordeon]').forEach(c => c.classList.remove('abierto', 'requerido'));

  // [v9] Marca de estado por campo, con los valores ya precargados arriba.
  inicializarMarcas();

  document.getElementById('cardActualizar').style.display = cab.esCierre ? 'none' : 'block';

  // [v11] La corrección solo la ven ADMIN y SUPERVISOR. Se ofrece siempre,
  // pero el texto cambia cuando la oportunidad está cerrada, que es el caso
  // que motivó el módulo.
  const cardCorr = document.getElementById('cardCorreccion');
  if (cardCorr) {
    cardCorr.style.display = verTodos ? 'block' : 'none';
    const txt = document.getElementById('correccionTexto');
    if (txt && cab.esCierre) {
      txt.innerHTML = `Esta oportunidad está <strong>cerrada en ${cab.faseVenta}</strong>.
        Si ese cierre fue un error, revierte el último movimiento: la oportunidad
        vuelve a su fase anterior y queda registrado quién lo corrigió y por qué.`;
    }
  }
  if (cab.esCierre) toast(`Esta oportunidad está cerrada: ${cab.tipoCierre || 'CERRADA'}`, 'ok');

  // Scroll suave al detalle
  setTimeout(() => document.getElementById('detalleOportunidad').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

/* ══════════════════════════════════════════════════════════════════
   [v10] CHECKLIST DE CONFIRMACIÓN
   ──────────────────────────────────────────────────────────────────
   Lista los cambios reales antes de ejecutar el movimiento. Reutiliza
   dataset.valorOriginal (lo guarda inicializarMarcas), así que no hay
   una segunda fuente de verdad sobre "qué cambió".
══════════════════════════════════════════════════════════════════ */

// Etiqueta legible de cada campo del formulario.
const ETIQUETAS_CAMPO = {
  upNumeroCotizacion:    'N° Cotización',
  upTiempoMeses:         'Tiempo (meses)',
  upIdModalidad:         'Modalidad',
  upIdServicio:          'Servicio',
  upNit:                 'NIT del cliente',
  upMesInicioServicio:   'Mes inicio servicio',
  upFechaInicioServicio: 'Fecha inicio servicio',
  upIdMunicipio:         'Ciudad / Municipio',
  upValorMensual:        'Valor mensual',
  upCosto:               'Costo mensual'
};

// Texto mostrable de un campo (para los <select> usa la etiqueta, no el id).
function textoCampo(el, valor) {
  if (!valor) return '<em>vacío</em>';
  if (el.tagName === 'SELECT') {
    const opt = Array.from(el.options).find(o => o.value === valor);
    return opt ? opt.textContent.trim() : valor;
  }
  return valor;
}

async function confirmarCambios(nuevaFaseText) {
  const cambios = [];

  Object.keys(ETIQUETAS_CAMPO).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const antes  = el.dataset.valorOriginal ?? '';
    const ahora  = el.value || '';
    if (antes === ahora) return;
    cambios.push(`<li><strong>${ETIQUETAS_CAMPO[id]}:</strong>
      <span style="color:#8896B0">${textoCampo(el, antes)}</span>
      <i class="bi bi-arrow-right mx-1"></i>
      <span style="color:#2A8C38;font-weight:700">${textoCampo(el, ahora)}</span></li>`);
  });

  const faseAnterior = catalogoFases.find(f => f.id === idFaseActiva)?.descripcion || '—';
  const cambiaFase   = normalizarTexto(faseAnterior) !== normalizarTexto(nuevaFaseText);

  const bloqueFase = cambiaFase
    ? `<li><strong>Fase:</strong>
         <span style="color:#8896B0">${faseAnterior}</span>
         <i class="bi bi-arrow-right mx-1"></i>
         <span style="color:#2A8C38;font-weight:700">${nuevaFaseText}</span></li>`
    : `<li><strong>Fase:</strong> se mantiene en <strong>${nuevaFaseText}</strong></li>`;

  const listaDatos = cambios.length
    ? `<ul class="check-cambios">${cambios.join('')}</ul>`
    : `<p class="check-sin-cambios"><i class="bi bi-info-circle me-1"></i>
         No modificaste ningún dato de la oportunidad: solo se registrará el movimiento.</p>`;

  const res = await Swal.fire({
    icon: null,
    title: 'Revisa antes de actualizar',
    html: `
      <div class="check-wrap">
        <p class="check-sub">Se registrará este movimiento con los siguientes cambios:</p>
        <ul class="check-cambios">${bloqueFase}</ul>
        <p class="check-sub">Datos de la oportunidad</p>
        ${listaDatos}
      </div>`,
    width: 620,
    showCancelButton: true,
    confirmButtonText: '<i class="bi bi-check2-circle me-1"></i> Actualizar',
    cancelButtonText: 'Volver a revisar',
    confirmButtonColor: '#003087',
    cancelButtonColor: '#8896B0',
    reverseButtons: true,
    focusCancel: true
  });

  return res.isConfirmed;
}

/* ══════════════════════════════════════════════════════════════════
   [v11] CORRECCIÓN DE CIERRES MAL REGISTRADOS
   ──────────────────────────────────────────────────────────────────
   Nada se borra. Revertir marca el movimiento como anulado y la
   oportunidad regresa a su fase anterior; anular la oportunidad la
   saca de la grilla y de los indicadores. Ambas quedan auditadas en
   la base con usuario, fecha y motivo.
══════════════════════════════════════════════════════════════════ */

// Cabeceras de identidad: el backend valida el rol con ellas.
function cabecerasIdentidad() {
  return {
    'Content-Type': 'application/json',
    'X-Usuario': usuario || '',
    'X-Rol': rol || ''
  };
}

// Diálogo común: pide el motivo y ejecuta la acción indicada.
async function pedirMotivoYEjecutar({ titulo, html, textoBoton, endpoint, exito }) {
  if (!idOportunidadActiva) { toast('Abre primero una oportunidad.', 'err'); return; }

  const { value: motivo, isConfirmed } = await Swal.fire({
    title: titulo,
    html,
    input: 'textarea',
    inputLabel: 'Motivo de la corrección',
    inputPlaceholder: 'Ej: el consultor marcó VENTA por error, el cliente aún está en negociación',
    inputAttributes: { 'aria-label': 'Motivo', maxlength: 500 },
    showCancelButton: true,
    confirmButtonText: textoBoton,
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#D93025',
    cancelButtonColor: '#8896B0',
    reverseButtons: true,
    focusCancel: true,
    inputValidator: v => (!v || v.trim().length < 10)
      ? 'Describe el motivo con al menos 10 caracteres: queda como traza de auditoría.'
      : undefined
  });

  if (!isConfirmed || !motivo) return;

  try {
    const res = await fetchJson(`${API}/oportunidades/${endpoint}`, {
      method: 'POST',
      headers: cabecerasIdentidad(),
      body: JSON.stringify({ idOportunidad: parseInt(idOportunidadActiva), motivo: motivo.trim() })
    });

    await Swal.fire({
      icon: 'success',
      title: 'Listo',
      text: res.message || exito,
      confirmButtonColor: '#003087'
    });

    volverAGrilla();
    cargarGrilla();
  } catch (e) {
    Swal.fire({
      icon: 'error',
      title: 'No se pudo completar',
      text: e.message || 'Error de conexión.',
      confirmButtonColor: '#003087'
    });
  }
}

function revertirUltimoMovimiento() {
  pedirMotivoYEjecutar({
    titulo: '¿Revertir el último movimiento?',
    html: `El movimiento vigente quedará <strong>anulado</strong> y la oportunidad
           volverá a la fase anterior.<br>No se borra nada: seguirá visible en el
           historial marcado como anulado.`,
    textoBoton: '<i class="bi bi-arrow-counterclockwise me-1"></i> Revertir',
    endpoint: 'revertir-movimiento',
    exito: 'Movimiento revertido.'
  });
}

function anularOportunidad() {
  pedirMotivoYEjecutar({
    titulo: '¿Anular la oportunidad completa?',
    html: `La oportunidad <strong>desaparecerá de la grilla y de todos los
           indicadores</strong>.<br>Los datos no se borran: quedan en la base para
           auditoría. Usa esta opción solo si el registro completo fue un error.`,
    textoBoton: '<i class="bi bi-trash3 me-1"></i> Anular',
    endpoint: 'anular',
    exito: 'Oportunidad anulada.'
  });
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

  // [v9] Los campos obligatorios dependen de la fase elegida.
  //      En Contacto / Visita solo se pide fase y observación; en Propuesta,
  //      Negociación y Venta se exige además la información comercial.
  //      La regla vive en el catálogo (RequiereDatosComerciales).
  const reqs = faseExigeDatos()
    ? ['upFaseVenta', 'upConsultor', 'upTiempoMeses', 'upMesInicioServicio', 'upFechaInicioServicio']
    : ['upFaseVenta', 'upConsultor'];
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

  // [v9] Las fases de cierre (NO PRESENTADO / NO ADJUDICADO / VENTA) y PASO DE
  //      MES se pueden registrar desde cualquier etapa: perder una oportunidad
  //      no es retroceder. El permiso viene del catálogo, no de una lista fija.
  if (fasePermiteDesdeCualquiera(nuevaFaseObj)) {
    const esPerdida = normalizarTexto(nuevaFaseText).includes('NO ');
    if (esPerdida) {
      const confirmar = await Swal.fire({
        icon: 'question',
        title: '¿Cerrar la oportunidad?',
        html: `Vas a registrar <strong>${nuevaFaseText}</strong>.<br>
               La oportunidad quedará cerrada y no se podrán registrar más movimientos.`,
        showCancelButton: true,
        confirmButtonColor: '#003087',
        confirmButtonText: 'Sí, cerrar',
        cancelButtonText: 'Cancelar'
      });
      if (!confirmar.isConfirmed) return;
    }
  }
  else if (ordenFaseActiva > 0 && nuevaOrden > 0 && nuevaFaseId !== idFaseActiva && nuevaOrden < ordenFaseActiva) {
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

  // [v9] N° de cotización: obligatorio si la fase lo exige. Se valida sobre el
  //      valor EFECTIVO: si la oportunidad ya lo tenía, no hay que reescribirlo.
  if (faseExigeCotizacion()) {
    const elCot = document.getElementById('upNumeroCotizacion');
    const cotEfectiva = (elCot.value.trim() || cotizacionActiva || '').trim();
    if (!cotEfectiva) {
      elCot.classList.add('error');
      abrirAcordeon(elCot.closest('[data-acordeon]'), true);
      toast('Esta fase exige el N° de cotización.', 'err');
      return;
    }
    elCot.classList.remove('error');
  }

  // [v10] NIT: solo dígitos, máximo 9 (misma regla que en Nueva Oportunidad).
  const elNitUp  = document.getElementById('upNit');
  const nitUpVal = elNitUp.value.trim();
  if (nitUpVal && !/^\d{1,9}$/.test(nitUpVal)) {
    elNitUp.classList.add('error');
    toast('El NIT debe tener solo números, máximo 9 dígitos.', 'err');
    return;
  }
  elNitUp.classList.remove('error');

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

  // [v10] RESUMEN DE CAMBIOS ANTES DE GUARDAR
  // Se arma con las mismas marcas que ya pinta inicializarMarcas(): un campo
  // cuenta como cambio cuando su valor difiere del que traía la oportunidad.
  // Así el usuario confirma sobre hechos, no sobre lo que cree que tocó.
  const confirmado = await confirmarCambios(nuevaFaseText);
  if (!confirmado) return;

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
  const upIdModalidad   = parseInt(document.getElementById('upIdModalidad').value) || null;
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
    idModalidad:         upIdModalidad,        // mapea a IdModalidad en DTO (opcional)
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
  const selMo = document.getElementById('upIdModalidad');
  if (selMo) selMo.selectedIndex = 0;
  const selM = document.getElementById('upIdMunicipio');
  if (selM) selM.innerHTML = '<option value="">— Busca primero arriba —</option>';
  const buscarM = document.getElementById('upBuscarMunicipio');
  if (buscarM) buscarM.value = '';
  calcularAIU2();
}

// [M-4] Se eliminaron mostrarEditCotizacion() y guardarNumeroCotizacion().
// Referenciaban #cardEditCotizacion y #editNumeroCotizacion, que no existen en
// ningún HTML desde que la edición del N° de cotización se integró al
// formulario de actualización. La segunda habría lanzado una excepción si algo
// la invocaba. El endpoint /oportunidades/asignar-cotizacion sigue disponible
// en la API para uso futuro.

// ── INIT ──────────────────────────────────────────────────────────
(async () => {
  // [v10] RENDIMIENTO — Antes: await cargarCatalogos(); await cargarGrilla();
  // La grilla esperaba a que terminaran los cinco catálogos (incluido el de
  // municipios, que son más de mil filas) para recién pedir sus datos. Son
  // llamadas independientes: van en paralelo y el tiempo total pasa a ser el
  // de la más lenta, no la suma de todas.
  await Promise.all([cargarCatalogos(), cargarGrilla()]);

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
