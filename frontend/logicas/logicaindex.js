const API_BASE = 'http://localhost:5000/api/auth';

/* ── Helpers ────────────────────────────────────────────────── */

/**
 * Calcula el SHA-256 hex de un string usando la Web Crypto API nativa.
 * @param {string} message
 * @returns {Promise<string>} hex string lowercase
 */
async function sha256(message) {
  const encoder = new TextEncoder();
  const data     = encoder.encode(message);
  const hashBuf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Muestra un mensaje en el contenedor de mensajes del login.
 * @param {'error'|'success'|'loading'|'hide'} type
 * @param {string} [text]
 */
function showMsg(type, text) {
  const box = document.getElementById('msgBox');
  if (!box) return;

  // Limpiar clases anteriores
  box.className = 'msg-box';
  box.innerHTML = '';

  if (type === 'hide') return;

  box.classList.add(type, 'visible');

  if (type === 'loading') {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    box.appendChild(spinner);
  }

  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    box.appendChild(span);
  }
}

/**
 * Muestra un mensaje en el modal de recuperación.
 */
function showModalMsg(type, text) {
  const box = document.getElementById('modalMsgBox');
  if (!box) return;
  box.className = 'msg-box';
  box.innerHTML = '';
  if (type === 'hide') return;
  box.classList.add(type, 'visible');
  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    box.appendChild(span);
  }
}

/* ── Función principal de Login ─────────────────────────────── */
async function login() {
  const usuarioInput = document.getElementById('usuario');
  const claveInput   = document.getElementById('clave');
  const btnLogin     = document.querySelector('.btn-login');

  const usuario = usuarioInput.value.trim().toUpperCase();
  const clave   = claveInput.value;

  // Validación básica de campos vacíos
  if (!usuario || !clave) {
    showMsg('error', 'Por favor completa usuario y contraseña.');
    return;
  }

  // Estado de carga
  showMsg('loading', 'Verificando credenciales…');
  btnLogin.classList.add('loading-state');
  btnLogin.disabled = true;

  try {
    // Hash SHA-256 de la contraseña (igual que HASHBYTES('SHA2_256', ...) en hex mayúsculas)
    const hashHex   = await sha256(clave);
    const hashUpper = hashHex.toUpperCase();   // SQL usa hex en mayúsculas por defecto

    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, passwordHash: hashUpper })
    });

    const data = await response.json();

    if (data.ok) {
      // Guardar sesión
      sessionStorage.setItem('crm_usuario', data.nombre);
      sessionStorage.setItem('crm_rol',     data.rol);

      showMsg('success', `Bienvenido, ${data.nombre}. Redirigiendo…`);

      // Redirigir según rol
      setTimeout(() => {
        window.location.href = 'nueva-oportunidad.html';
      }, 800);

    } else {
      showMsg('error', data.msg || 'Usuario o contraseña incorrectos.');
      claveInput.value = '';
      claveInput.focus();
    }

  } catch (err) {
    console.error('Error de red:', err);
    showMsg('error', 'No se pudo conectar al servidor. Intenta de nuevo.');
  } finally {
    btnLogin.classList.remove('loading-state');
    btnLogin.disabled = false;
  }
}

/* ── Redirigir si ya hay sesión activa ──────────────────────── */
(function checkSession() {
  const usr = sessionStorage.getItem('crm_usuario');
  if (usr) {
    window.location.href = 'nueva-oportunidad.html';
  }
})();

/* ── Enter en cualquier campo dispara login ─────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#usuario, #clave').forEach(input =>
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') login();
    })
  );

  // ── Canvas de partículas ──────────────────────────────────────
  initParticles();
});

/* ── Modal de recuperación ──────────────────────────────────── */
function openForgotModal() {
  const overlay = document.getElementById('forgotModal');
  if (!overlay) return;
  overlay.classList.add('open');
  document.getElementById('resetUsuario')?.focus();
  resetModalToStep(1);
}

function closeForgotModal() {
  const overlay = document.getElementById('forgotModal');
  if (!overlay) return;
  overlay.classList.remove('open');
  showModalMsg('hide');
  resetModalToStep(1);
  // Limpiar campos
  ['resetUsuario','resetEmail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function resetModalToStep(step) {
  document.querySelectorAll('.modal-step').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`step${step}`);
  if (target) target.classList.add('active');
}

/**
 * Paso 1: solicitar token de reset
 * El backend llama a CRM.SP_SolicitarReset y envía el email con el link.
 */
async function solicitarReset() {
  const usuario = document.getElementById('resetUsuario')?.value.trim().toUpperCase();
  const email   = document.getElementById('resetEmail')?.value.trim().toLowerCase();

  if (!usuario || !email) {
    showModalMsg('error', 'Completa usuario y correo electrónico.');
    return;
  }

  // Validación básica de formato email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showModalMsg('error', 'El formato del correo no es válido.');
    return;
  }

  showModalMsg('loading', 'Verificando datos…');

  try {
    const response = await fetch(`${API_BASE}/solicitar-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, email })
    });

    const data = await response.json();

    // El SP siempre responde con ok:1 por seguridad (no revela si el usuario existe)
    // Mostrar mensaje genérico y pasar al paso 2
    showModalMsg('success', 'Si los datos son correctos, recibirás el enlace en tu correo en los próximos minutos.');
    resetModalToStep(2);

  } catch (err) {
    console.error('Error solicitar reset:', err);
    showModalMsg('error', 'Error de conexión. Intenta más tarde.');
  }
}

/* ── Partículas animadas (canvas) ───────────────────────────── */
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(true); }

    reset(initial = false) {
      this.x     = Math.random() * W;
      this.y     = initial ? Math.random() * H : H + 10;
      this.r     = Math.random() * 1.8 + 0.4;
      this.alpha = Math.random() * 0.5 + 0.1;
      this.speed = Math.random() * 0.4 + 0.12;
      this.drift = (Math.random() - 0.5) * 0.25;
      // Color: mayormente azul-blanco, algunos verdes
      const green = Math.random() < 0.18;
      this.color = green
        ? `rgba(57,181,74,${this.alpha})`
        : `rgba(${150 + Math.floor(Math.random()*105)},${180 + Math.floor(Math.random()*60)},255,${this.alpha})`;
    }

    update() {
      this.y -= this.speed;
      this.x += this.drift;
      if (this.y < -10) this.reset();
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  function init() {
    resize();
    const COUNT = Math.floor((W * H) / 9000);  // densidad adaptativa
    particles = Array.from({ length: COUNT }, () => new Particle());
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => {
    resize();
    // Repartir partículas si cambia tamaño
    const newCount = Math.floor((W * H) / 9000);
    if (newCount > particles.length) {
      for (let i = particles.length; i < newCount; i++)
        particles.push(new Particle());
    } else {
      particles.length = newCount;
    }
  });

  init();
  loop();
}