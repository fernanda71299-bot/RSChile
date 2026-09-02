const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const CONFIG_PATH = path.join(__dirname, 'config', 'sectors.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

let config = loadConfig();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Public config: sectors + textos de la app, nunca el PIN del director
app.get('/api/sectors', (req, res) => {
  res.json({
    eventName: config.eventName,
    welcomeTitle: config.welcomeTitle || '',
    welcomeMessage: config.welcomeMessage || '',
    credit: config.credit || '',
    sectors: config.sectors.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      instructions: s.instructions || ''
    }))
  });
});

// Allows the director to reload sectors.json without restarting the server
app.post('/api/reload-config', (req, res) => {
  try {
    config = loadConfig();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'No se pudo recargar la configuracion' });
  }
});

// sectorId -> count of connected fan sockets
const sectorCounts = {};

function sectorName(sectorId) {
  const s = config.sectors.find((x) => x.id === sectorId);
  return s ? s.name : sectorId;
}

function broadcastCounts() {
  io.to('directors').emit('sector-counts', sectorCounts);
}

io.on('connection', (socket) => {
  socket.data.role = null;
  socket.data.sectorId = null;

  socket.on('join-sector', (payload, ack) => {
    const sectorId = payload && payload.sectorId;
    const valid = config.sectors.some((s) => s.id === sectorId);
    if (!valid) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Sector invalido' });
      return;
    }
    socket.data.role = 'fan';
    socket.data.sectorId = sectorId;
    socket.join(sectorId);

    sectorCounts[sectorId] = (sectorCounts[sectorId] || 0) + 1;
    broadcastCounts();

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('director-auth', (payload, ack) => {
    const pin = payload && payload.pin;
    if (String(pin) === String(config.directorPin)) {
      socket.data.role = 'director';
      socket.join('directors');
      if (typeof ack === 'function') {
        ack({
          ok: true,
          eventName: config.eventName,
          sectors: config.sectors,
          sequence: config.sequence || null
        });
      }
      socket.emit('sector-counts', sectorCounts);
    } else {
      if (typeof ack === 'function') ack({ ok: false, error: 'PIN incorrecto' });
    }
  });

  socket.on('trigger-flash', (payload, ack) => {
    if (socket.data.role !== 'director') {
      if (typeof ack === 'function') ack({ ok: false, error: 'No autorizado' });
      return;
    }
    const sectorId = payload && payload.sectorId;
    const color = (payload && payload.color) || '#FFFFFF';
    const pattern = (payload && payload.pattern) || 'solid';
    const duration = Math.max(500, Math.min(30000, Number((payload && payload.duration) || 3000)));
    const useTorch = !!(payload && payload.torch);

    const eventPayload = { color, pattern, duration, torch: useTorch, sectorId, ts: Date.now() };

    if (sectorId === 'ALL') {
      io.emit('flash', eventPayload);
    } else {
      const valid = config.sectors.some((s) => s.id === sectorId);
      if (!valid) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Sector invalido' });
        return;
      }
      io.to(sectorId).emit('flash', eventPayload);
    }

    io.to('directors').emit('flash-log', {
      sectorId,
      sectorName: sectorId === 'ALL' ? 'TODOS' : sectorName(sectorId),
      color,
      pattern,
      duration,
      torch: useTorch,
      ts: eventPayload.ts
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  // Etapa de la secuencia (ej. armado de la bandera): enciende de forma
  // sostenida todos los sectores que participan de esa etapa, con el
  // color/patrón definido en la configuración. Queda prendido hasta la
  // próxima etapa o el reinicio (no es un flash temporizado).
  socket.on('sequence-stage', (payload, ack) => {
    if (socket.data.role !== 'director') {
      if (typeof ack === 'function') ack({ ok: false, error: 'No autorizado' });
      return;
    }
    const stages = (config.sequence && config.sequence.stages) || [];
    const stageIndex = Number(payload && payload.stageIndex);
    const stage = stages[stageIndex];
    if (!stage) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Etapa invalida' });
      return;
    }
    stage.sectors.forEach((s) => {
      io.to(s.id).emit('flash-hold', {
        sectorId: s.id,
        color: s.color,
        pattern: s.pattern || 'solid',
        ts: Date.now()
      });
    });
    io.to('directors').emit('sequence-log', {
      stageIndex,
      label: stage.label,
      ts: Date.now()
    });
    if (typeof ack === 'function') ack({ ok: true });
  });

  // Apaga todos los sectores que participan de la secuencia, para volver a
  // empezar desde cero.
  socket.on('sequence-reset', (payload, ack) => {
    if (socket.data.role !== 'director') {
      if (typeof ack === 'function') ack({ ok: false, error: 'No autorizado' });
      return;
    }
    const stages = (config.sequence && config.sequence.stages) || [];
    const allIds = new Set();
    stages.forEach((st) => st.sectors.forEach((s) => allIds.add(s.id)));
    allIds.forEach((id) => io.to(id).emit('flash-off', { sectorId: id, ts: Date.now() }));
    io.to('directors').emit('sequence-log', { stageIndex: -1, label: 'Reinicio', ts: Date.now() });
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('disconnect', () => {
    if (socket.data.role === 'fan' && socket.data.sectorId) {
      const id = socket.data.sectorId;
      sectorCounts[id] = Math.max(0, (sectorCounts[id] || 1) - 1);
      broadcastCounts();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Romeo Fan Action escuchando en puerto ${PORT}`);
});

module.exports = { app, server, io };
