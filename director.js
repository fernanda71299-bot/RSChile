(function () {
  const loginScreen = document.getElementById('login-screen');
  const panelScreen = document.getElementById('panel-screen');
  const pinInput = document.getElementById('pin-input');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');

  const eventNameEl = document.getElementById('d-event-name');
  const connDot = document.getElementById('d-conn-dot');
  const totalsEl = document.getElementById('totals');

  const globalColor = document.getElementById('global-color');
  const globalPattern = document.getElementById('global-pattern');
  const globalDuration = document.getElementById('global-duration');
  const durationLabel = document.getElementById('duration-label');
  const globalTorch = document.getElementById('global-torch');

  const flashAllBtn = document.getElementById('flash-all-btn');
  const sectorGrid = document.getElementById('sector-grid');
  const logList = document.getElementById('log-list');

  let sectors = [];
  let counts = {};

  const socket = io({ reconnection: true });

  globalDuration.addEventListener('input', () => {
    durationLabel.textContent = globalDuration.value + 's';
  });

  function currentSettings() {
    return {
      color: globalColor.value,
      pattern: globalPattern.value,
      duration: Math.round(parseFloat(globalDuration.value) * 1000),
      torch: globalTorch.checked
    };
  }

  function triggerFlash(sectorId, colorOverride) {
    const s = currentSettings();
    socket.emit('trigger-flash', {
      sectorId,
      color: colorOverride || s.color,
      pattern: s.pattern,
      duration: s.duration,
      torch: s.torch
    });
  }

  flashAllBtn.addEventListener('click', () => triggerFlash('ALL'));

  function renderSectors() {
    sectorGrid.innerHTML = '';
    sectors.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'sector-card';
      card.innerHTML =
        '<div class="chip-row"><span class="chip" style="background:' + s.color + '"></span>' +
        '<span class="sname">' + s.name + '</span></div>' +
        '<span class="scount" data-count-for="' + s.id + '">0 conectados</span>' +
        '<button data-flash-for="' + s.id + '">⚡ Flash sector (' + s.color + ')</button>';
      sectorGrid.appendChild(card);
    });

    sectorGrid.querySelectorAll('[data-flash-for]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-flash-for');
        const sector = sectors.find((x) => x.id === id);
        triggerFlash(id, sector ? sector.color : undefined);
      });
    });

    updateCounts();
  }

  function updateCounts() {
    let total = 0;
    sectors.forEach((s) => {
      const c = counts[s.id] || 0;
      total += c;
      const el = sectorGrid.querySelector('[data-count-for="' + s.id + '"]');
      if (el) el.textContent = c + ' conectados';
    });
    totalsEl.textContent = total + ' fans conectados';
  }

  function addLogRow(entry) {
    const row = document.createElement('div');
    row.className = 'log-row';
    const time = new Date(entry.ts).toLocaleTimeString();
    row.innerHTML =
      '<span class="log-chip" style="background:' + entry.color + '"></span>' +
      '<span>' + time + ' · ' + entry.sectorName + ' · ' + entry.pattern + ' · ' + (entry.duration / 1000) + 's' +
      (entry.torch ? ' · 🔦' : '') + '</span>';
    logList.appendChild(row);
    while (logList.children.length > 30) {
      logList.removeChild(logList.firstChild);
    }
  }

  function doLogin() {
    const pin = pinInput.value.trim();
    if (!pin) return;
    socket.emit('director-auth', { pin }, (res) => {
      if (res && res.ok) {
        sectors = res.sectors || [];
        eventNameEl.textContent = res.eventName || 'Fan Action';
        loginScreen.classList.add('hidden');
        panelScreen.classList.remove('hidden');
        renderSectors();
      } else {
        loginError.textContent = (res && res.error) || 'Error al autenticar';
      }
    });
  }

  loginBtn.addEventListener('click', doLogin);
  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  socket.on('connect', () => connDot.classList.add('online'));
  socket.on('disconnect', () => connDot.classList.remove('online'));

  socket.on('sector-counts', (data) => {
    counts = data || {};
    if (sectors.length) updateCounts();
  });

  socket.on('flash-log', (entry) => addLogRow(entry));
})();
