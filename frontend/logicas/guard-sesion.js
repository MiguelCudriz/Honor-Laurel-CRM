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
})();
