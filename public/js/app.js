(function () {
  const connDot = document.getElementById('conn-dot');
  const eventNameEl = document.getElementById('event-name');
  const screenSelect = document.getElementById('screen-select');
  const screenReady = document.getElementById('screen-ready');
  const sectorListEl = document.getElementById('sector-list');
  const mySwatch = document.getElementById('my-swatch');
  const mySectorName = document.getElementById('my-sector-name');
  const statusText = document.getElementById('status-text');
  const flashOverlay = document.getElementById('flash-overlay');
  const changeSectorBtn = document.getElementById('change-sector-btn');
  const torchToggle = document.getElementById('torch-toggle');
  const torchNote = document.getElementById('torch-note');

  const installBanner = document.getElementById('install-banner');
  const installText = document.getElementById('install-text');
  const installBtn = document.getElementById('install-btn');
  const installDismiss = document.getElementById('install-dismiss');

  const welcomeModal = document.getElementById('welcome-modal');
  const welcomeTitleEl = document.getElementById('welcome-title');
  const welcomeMessageEl = document.getElementById('welcome-message');
  const welcomeOkBtn = document.getElementById('welcome-ok');
  const creditTextEl = document.getElementById('credit-text');
  const manualFlashBtn = document.getElementById('manual-flash-btn');
  const manualFlashLabel = document.getElementById('manual-flash-label');

  let sectors = [];
  let mySector = null; // {id, name, color}
  let torchTrack = null;
  let torchSupported = false;
  let torchEnabled = false;
  let blinkTimer = null;

  const STORAGE_KEY = 'fanaction_sector_id';

  function setConnected(online) {
    connDot.classList.toggle('online', online);
  }

  function renderSectorList() {
    sectorListEl.innerHTML = '';
    sectors.forEach((s) => {
      const btn = document.createElement('button');
      btn.className = 'sector-btn';
      btn.innerHTML =
        '<span class="sector-chip" style="background:' + s.color + '"></span><span>' + s.name + '</span>';
      btn.addEventListener('click', () => selectSector(s.id));
      sectorListEl.appendChild(btn);
    });
  }

  function showReadyScreen() {
    screenSelect.classList.add('hidden');
    screenReady.classList.remove('hidden');
    mySwatch.style.background = mySector.color;
    mySwatch.style.boxShadow = '0 0 40px ' + mySector.color + '55';
    mySectorName.textContent = mySector.name;
  }

  function showSelectScreen() {
    screenReady.classList.add('hidden');
    screenSelect.classList.remove('hidden');
  }

  function selectSector(id) {
    const s = sectors.find((x) => x.id === id);
    if (!s) return;
    mySector = s;
    localStorage.setItem(STORAGE_KEY, id);
    showReadyScreen();
    resetManualFlash();
    joinSector(id);
  }

  function joinSector(id) {
    socket.emit('join-sector', { sectorId: id }, (res) => {
      if (res && res.ok) {
        statusText.textContent = 'Conectado. Esperando la señal del animador...';
      } else {
        statusText.textContent = 'No se pudo unir al sector. Intenta de nuevo.';
      }
    });
  }

  changeSectorBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    resetManualFlash();
    showSelectScreen();
  });

  function resetManualFlash() {
    manualOn = false;
    clearInterval(blinkTimer);
    flashOverlay.style.backgroundColor = 'transparent';
    setTorch(false);
    manualFlashBtn.classList.remove('active');
    manualFlashLabel.classList.remove('active-label');
    manualFlashLabel.textContent = '¡APRIETA EL BOTÓN!';
  }

  // ---------- Torch (linterna) ----------
  async function requestTorch() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps && caps.torch) {
        torchTrack = track;
        torchSupported = true;
        torchNote.textContent = 'Flash físico activado. Se encenderá junto con la pantalla.';
      } else {
        track.stop();
        torchSupported = false;
        torchNote.textContent = 'Tu teléfono/navegador no permite controlar el flash físico desde la web. Se usará solo la pantalla.';
        torchToggle.checked = false;
      }
    } catch (err) {
      torchSupported = false;
      torchNote.textContent = 'No se pudo acceder a la cámara. Se usará solo la pantalla.';
      torchToggle.checked = false;
    }
  }

  function stopTorch() {
    if (torchTrack) {
      try { torchTrack.applyConstraints({ advanced: [{ torch: false }] }); } catch (e) {}
      torchTrack.stop();
      torchTrack = null;
    }
    torchSupported = false;
  }

  torchToggle.addEventListener('change', () => {
    torchEnabled = torchToggle.checked;
    if (torchEnabled) {
      torchNote.textContent = 'Solicitando acceso a la cámara...';
      requestTorch();
    } else {
      stopTorch();
      torchNote.textContent = '';
    }
  });

  function setTorch(on) {
    if (!torchSupported || !torchTrack) return;
    try {
      torchTrack.applyConstraints({ advanced: [{ torch: !!on }] });
    } catch (e) {}
  }

  // ---------- Flash rendering ----------
  // manualOn: si el fan dejó su flash prendido "a mano" (botón grande), esta
  // es la pantalla/linterna a la que se vuelve una vez que termina cualquier
  // efecto temporizado que venga del director.
  let manualOn = false;

  function applyBaseState() {
    if (manualOn && mySector) {
      flashOverlay.style.backgroundColor = mySector.color;
      setTorch(true);
    } else {
      flashOverlay.style.backgroundColor = 'transparent';
      setTorch(false);
    }
  }

  function doFlash(payload) {
    const { color, pattern, duration } = payload;
    clearInterval(blinkTimer);

    if (navigator.vibrate) {
      navigator.vibrate(pattern === 'blink' ? [80, 60, 80, 60, 80] : 120);
    }

    if (pattern === 'blink') {
      let on = false;
      const interval = 180;
      blinkTimer = setInterval(() => {
        on = !on;
        flashOverlay.style.backgroundColor = on ? color : 'transparent';
        setTorch(on);
      }, interval);
      setTimeout(() => {
        clearInterval(blinkTimer);
        applyBaseState();
      }, duration);
    } else {
      flashOverlay.style.backgroundColor = color;
      setTorch(true);
      setTimeout(() => {
        applyBaseState();
      }, duration);
    }
  }

  // ---------- Socket ----------
  const socket = io({ reconnection: true });

  socket.on('connect', () => {
    setConnected(true);
    if (mySector) joinSector(mySector.id);
  });

  socket.on('disconnect', () => setConnected(false));

  socket.on('flash', (payload) => {
    if (!mySector) return;
    if (payload.sectorId === 'ALL' || payload.sectorId === mySector.id) {
      doFlash(payload);
    }
  });

  // ---------- Modal de bienvenida ----------
  const WELCOME_SEEN_KEY = 'fanaction_welcome_seen';

  function showWelcomeModal(title, message) {
    if (localStorage.getItem(WELCOME_SEEN_KEY)) return;
    if (title) welcomeTitleEl.textContent = title;
    if (message) welcomeMessageEl.textContent = message;
    welcomeModal.classList.remove('hidden');
  }

  welcomeOkBtn.addEventListener('click', () => {
    welcomeModal.classList.add('hidden');
    localStorage.setItem(WELCOME_SEEN_KEY, '1');
  });

  // ---------- Boton grande de flash manual ----------
  // Funciona como interruptor: un toque lo prende y se queda prendido hasta
  // que se vuelva a tocar. No depende del servidor ni de señal, así que
  // sirve tanto como gesto espontáneo del fan como respaldo si la red del
  // recinto está saturada.
  manualFlashBtn.addEventListener('click', () => {
    if (!mySector) return;
    manualOn = !manualOn;
    manualFlashBtn.classList.toggle('active', manualOn);
    manualFlashLabel.classList.toggle('active-label', manualOn);
    manualFlashLabel.textContent = manualOn ? '¡PRENDIDO! TOCA PARA APAGAR' : '¡APRIETA EL BOTÓN!';
    if (navigator.vibrate) navigator.vibrate(manualOn ? 150 : 60);
    clearInterval(blinkTimer);
    applyBaseState();
  });

  // ---------- Instalar como app (PWA) ----------
  const INSTALL_DISMISS_KEY = 'fanaction_install_dismissed';
  let deferredInstallPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  function showInstallBanner() {
    if (isStandalone() || localStorage.getItem(INSTALL_DISMISS_KEY)) return;
    installBanner.classList.remove('hidden');
  }

  installDismiss.addEventListener('click', () => {
    installBanner.classList.add('hidden');
    localStorage.setItem(INSTALL_DISMISS_KEY, '1');
  });

  // Chrome/Android: se puede disparar el prompt nativo de instalación
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.classList.remove('hidden');
    installText.textContent = '📲 Instala esta app en tu pantalla de inicio para acceder más rápido';
    showInstallBanner();
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBanner.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    installBanner.classList.add('hidden');
  });

  // iOS Safari no soporta el prompt automático: mostramos instrucción manual
  if (isIOS() && !isStandalone()) {
    installText.textContent = '📲 Para instalar: toca compartir (⬆️) y luego "Agregar a inicio"';
    showInstallBanner();
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  // ---------- Init ----------
  fetch('/api/sectors')
    .then((r) => r.json())
    .then((data) => {
      sectors = data.sectors || [];
      if (data.eventName) eventNameEl.textContent = data.eventName;
      if (data.credit) creditTextEl.textContent = data.credit;
      renderSectorList();
      showWelcomeModal(data.welcomeTitle, data.welcomeMessage);

      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId && sectors.some((s) => s.id === savedId)) {
        selectSector(savedId);
      }
    })
    .catch(() => {
      sectorListEl.innerHTML = '<p class="loading">No se pudo cargar la lista de sectores. Revisa tu conexión.</p>';
    });
})();
