/* ================================================================
   guard-sesion.js — CRM Honor · Control de sesión y permisos
   ----------------------------------------------------------------
   ÚNICA fuente de verdad de "quién ve qué".

   Se carga ANTES del JS propio de cada página:
     <script src="/frontend/logicas/guard-sesion.js"></script>
     <script src="/frontend/logicas/logicaXXX.js"></script>

   Hace tres cosas:
     1. Exige sesión activa (si no hay, manda a index.html).
     2. Bloquea el acceso directo por URL a páginas no permitidas
        para el rol (un CONSULTOR ya no puede entrar escribiendo
        .../admin-metas.html en la barra de direcciones).
     3. Oculta —o muestra— los enlaces del navbar y del sidebar
        según el rol, para que el usuario ni siquiera vea la opción.

   PARA CAMBIAR PERMISOS: edita únicamente el objeto PERMISOS.
   No hay reglas de rol dispersas en los demás archivos.
   ================================================================ */

(function () {
  'use strict';

  // ── MATRIZ DE PERMISOS ──────────────────────────────────────────
  // Página (nombre de archivo) → roles que pueden abrirla.
  const PERMISOS = {
    'index.html':                  ['*'],
    'nueva-oportunidad.html':      ['ADMIN', 'SUPERVISOR', 'CONSULTOR'],
    'actualizar-oportunidad.html': ['ADMIN', 'SUPERVISOR', 'CONSULTOR'],
    'pipeline.html':               ['ADMIN', 'SUPERVISOR'],
    'admin-metas.html':            ['ADMIN'],
    'admin-catalogos.html':        ['ADMIN', 'SUPERVISOR'],
    'admin-consultores.html':      ['ADMIN']
  };

  // Página a la que se envía a quien no tiene permiso.
  const PAGINA_BASE = 'nueva-oportunidad.html';

  // ── SESIÓN ──────────────────────────────────────────────────────
  const usuario = sessionStorage.getItem('crm_usuario');
  const rol     = (sessionStorage.getItem('crm_rol') || '').trim().toUpperCase();

  const paginaActual = (window.location.pathname.split('/').pop() || 'index.html')
                        .toLowerCase();

  function puedeVer(pagina) {
    const roles = PERMISOS[(pagina || '').toLowerCase()];
    if (!roles) return true;                 // página no listada = sin restricción
    if (roles.includes('*')) return true;
    return roles.includes(rol);
  }

  // 1. Sin sesión → login (excepto en el propio login)
  if (!usuario && paginaActual !== 'index.html') {
    window.location.replace('index.html');
    return;
  }

  // 2. Con sesión pero sin permiso sobre esta página → fuera
  if (usuario && !puedeVer(paginaActual)) {
    window.location.replace(PAGINA_BASE);
    return;
  }

  // ── 3. ENLACES DE NAVEGACIÓN ────────────────────────────────────
  // Se resuelve al cargar el DOM para alcanzar navbar y sidebar.
  function aplicarPermisosEnMenu() {
    // 3.1 Enlaces normales: se decide por su href.
    document.querySelectorAll('a[href]').forEach(a => {
      const href = (a.getAttribute('href') || '').split('/').pop().split('?')[0];
      if (!href || !(href.toLowerCase() in PERMISOS)) return;   // enlace externo o sin regla
      a.style.display = puedeVer(href) ? '' : 'none';
    });

    // 3.2 Elementos con id conocido cuyo destino no está en el href
    //     (usan href="#" + onclick) o que son etiquetas/divisores del grupo.
    const grupos = [
      { pagina: 'pipeline.html',
        ids: ['sidebarPipelineItem', 'sidebarPipelineLabel', 'sidebarPipelineDivider'] },
      { pagina: 'admin-consultores.html',
        ids: ['navLinkAdmin', 'sidebarAdminItem', 'sidebarAdminLabel', 'sidebarAdminDivider'] }
    ];

    grupos.forEach(g => {
      const visible = puedeVer(g.pagina);
      g.ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
      });
    });

    // 3.3 Marcado manual opcional en el HTML:
    //     <elemento data-rol="ADMIN,SUPERVISOR">
    document.querySelectorAll('[data-rol]').forEach(el => {
      const permitidos = (el.getAttribute('data-rol') || '')
        .split(',').map(r => r.trim().toUpperCase()).filter(Boolean);
      el.style.display = permitidos.includes(rol) ? '' : 'none';
    });

    // 3.4 Limpieza de grupos vacíos del sidebar.
    //     Si todos los enlaces de un grupo quedaron ocultos, se oculta también
    //     su título ("Administración") y el divisor que lo precede, para no
    //     dejar encabezados sueltos. Es genérico: sirve para grupos nuevos
    //     sin necesidad de ponerles id.
    document.querySelectorAll('.sidebar-label').forEach(label => {
      let n = label.nextElementSibling;
      let hayVisible = false;

      while (n && !n.classList.contains('sidebar-label') && !n.classList.contains('sidebar-divider')) {
        if (n.style.display !== 'none') { hayVisible = true; break; }
        n = n.nextElementSibling;
      }

      if (!hayVisible) {
        label.style.display = 'none';
        const prev = label.previousElementSibling;
        if (prev && prev.classList.contains('sidebar-divider')) prev.style.display = 'none';
      }
    });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', aplicarPermisosEnMenu);
  else
    aplicarPermisosEnMenu();

  // ── API PÚBLICA ─────────────────────────────────────────────────
  // Los archivos logica*.js pueden consultar el rol sin releer sessionStorage.
  window.CRM_SESION = {
    usuario,
    rol,
    esAdmin:      rol === 'ADMIN',
    esSupervisor: rol === 'SUPERVISOR',
    esConsultor:  rol === 'CONSULTOR',
    verTodos:     rol === 'ADMIN' || rol === 'SUPERVISOR',
    puedeVer
  };

  /* ══════════════════════════════════════════════════════════════
     SUPRESIÓN DEL AUTOCOMPLETADO DEL NAVEGADOR
     ──────────────────────────────────────────────────────────────
     El desplegable "Información guardada" de Chrome reutiliza los
     valores que el usuario escribió antes en un campo con el mismo
     name/id. En un CRM eso es peligroso: invita a repetir un N° de
     cotización o una razón social de otro registro.

     Dos medidas combinadas, porque autocomplete="off" por sí solo
     no siempre basta:
       1. autocomplete="off" en cada campo.
       2. Un atributo name aleatorio por carga. Chrome asocia los
          valores guardados al name, así que si el name cambia en
          cada visita no tiene con qué emparejarlos.

     Los campos no se envían por <form>: el JS los lee por id, de
     modo que cambiar el name no afecta ningún guardado.
  ══════════════════════════════════════════════════════════════ */
  function aplicarACampo(el) {
    const tipo = (el.getAttribute('type') || '').toLowerCase();

    el.setAttribute('autocomplete', tipo === 'password' ? 'new-password' : 'off');

    if (el.tagName !== 'SELECT') {
      el.setAttribute('autocorrect', 'off');
      el.setAttribute('autocapitalize', 'off');
      el.setAttribute('spellcheck', 'false');
    }

    // name irrepetible por carga (no se usa para guardar: el JS lee por id)
    if (!el.dataset.crmName) {
      el.dataset.crmName = '1';
      el.setAttribute('name', 'f' + Math.random().toString(36).slice(2, 10));
    }
  }

  function bloquearAutocompletado(raiz) {
    (raiz || document).querySelectorAll('input, select, textarea').forEach(aplicarACampo);
  }

  // Se expone porque las páginas que inyectan campos por JS (grilla de
  // detalle, tablas de metas) deben volver a aplicarlo sobre lo nuevo.
  window.CRM_SESION.bloquearAutocompletado = bloquearAutocompletado;

  function iniciarAntiAutofill() {
    bloquearAutocompletado(document);

    // Los formularios que aparecen después (paneles de detalle, tarjetas
    // que se despliegan) se cubren observando el DOM.
    // Solo se inspecciona el nodo agregado, nunca el documento completo:
    // páginas como Indicadores redibujan tablas y gráficos con frecuencia.
    const SELECTOR = 'input, select, textarea';
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches(SELECTOR)) aplicarACampo(n);
          else if (n.querySelector && n.querySelector(SELECTOR)) bloquearAutocompletado(n);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', iniciarAntiAutofill);
  else
    iniciarAntiAutofill();
})();
