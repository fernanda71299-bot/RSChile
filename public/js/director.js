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

  const sequencePanel = document.getElementById('sequence-panel');
  const sequenceStageLabel = document.getElementById('sequence-stage-label');
  const sequenceProgress = document.getElementById('sequence-progress');
  const sequenceDelayInput = document.getElementById('sequence-delay');
  const sequencePlayBtn = document.getElementById('sequence-play-btn');
  const sequenceNextBtn = document.getElementById('sequence-next-btn');
  const sequenceResetBtn = document.getElementById('sequence-reset-btn');

  let sectors = [];
  let counts = {};
  let sequenceStages = [];
  let currentStage = -1;
  let sequencePlaying = false;
  let sequenceTimer = null;

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
        sequenceStages = (res.sequence && res.sequence.stages) || [];
        currentStage = -1;
        renderSequencePanel();
      } else {
        loginError.textContent = (res && res.error) || 'Error al autenticar';
      }
    });
  }

  // ---------- Secuencia: Bandera de Chile ----------
  function renderSequencePanel() {
    if (!sequenceStages.length) {
      sequencePanel.classList.add('hidden');
      return;
    }
    sequencePanel.classList.remove('hidden');
    sequenceProgress.innerHTML = '';
    sequenceStages.forEach((st, i) => {
      const dot = document.createElement('span');
      dot.className = 'seq-dot' + (i <= currentStage ? ' lit' : '');
      sequenceProgress.appendChild(dot);
    });
    sequenceStageLabel.textContent =
      currentStage === -1 ? 'Lista para comenzar.' : sequenceStages[currentStage].label;
  }

  function stopAutoplay() {
    clearTimeout(sequenceTimer);
    sequencePlaying = false;
    sequencePlayBtn.textContent = '▶ Reproducir automático';
  }

  function goToStage(index) {
    if (index < 0 || index >= sequenceStages.length) return;
    socket.emit('sequence-stage', { stageIndex: index }, (res) => {
      if (res && res.ok) {
        currentStage = index;
        renderSequencePanel();
      }
    });
  }

  function nextStage() {
    const next = currentStage + 1;
    if (next >= sequenceStages.length) {
      stopAutoplay();
      return;
    }
    goToStage(next);
  }

  sequencePlayBtn.addEventListener('click', () => {
    if (sequencePlaying) {
      stopAutoplay();
      return;
    }
    if (currentStage >= sequenceStages.length - 1) return;
    sequencePlaying = true;
    sequencePlayBtn.textContent = '⏸ Detener automático';
    const step = () => {
      nextStage();
      if (currentStage >= sequenceStages.length - 1) {
        stopAutoplay();
        return;
      }
      const delaySeconds = Math.max(1, Math.min(60, Number(sequenceDelayInput.value) || 4));
      sequenceTimer = setTimeout(step, delaySeconds * 1000);
    };
    step();
  });

  sequenceNextBtn.addEventListener('click', () => {
    stopAutoplay();
    nextStage();
  });

  sequenceResetBtn.addEventListener('click', () => {
    stopAutoplay();
    socket.emit('sequence-reset', {}, (res) => {
      if (res && res.ok) {
        currentStage = -1;
        renderSequencePanel();
      }
    });
  });

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

  socket.on('sequence-log', (entry) => {
    const row = document.createElement('div');
    row.className = 'log-row';
    const time = new Date(entry.ts).toLocaleTimeString();
    const label = entry.stageIndex === -1 ? 'Secuencia reiniciada' : entry.label;
    row.innerHTML =
      '<span class="log-chip" style="background:#FFD700"></span><span>' + time + ' · 🇨🇱 ' + label + '</span>';
    logList.appendChild(row);
    while (logList.children.length > 30) {
      logList.removeChild(logList.firstChild);
    }
  });
})();
