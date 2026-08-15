// Prueba funcional: simula un fan uniendose a un sector y un director
// autenticandose y disparando un flash, verificando que el fan lo reciba.
const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';
const PIN = '3535';
const SECTOR = 'platea-a';

let passed = 0;
let failed = 0;

function check(name, cond) {
  if (cond) {
    console.log('OK   -', name);
    passed++;
  } else {
    console.log('FAIL -', name);
    failed++;
  }
}

async function main() {
  const fan = io(URL, { transports: ['websocket'] });
  const director = io(URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise((res) => fan.on('connect', res)),
    new Promise((res) => director.on('connect', res))
  ]);
  check('fan y director conectados', fan.connected && director.connected);

  const joinRes = await new Promise((res) => fan.emit('join-sector', { sectorId: SECTOR }, res));
  check('fan se une al sector correctamente', joinRes && joinRes.ok === true);

  const badAuth = await new Promise((res) => director.emit('director-auth', { pin: 'wrong' }, res));
  check('PIN incorrecto es rechazado', badAuth && badAuth.ok === false);

  const authRes = await new Promise((res) => director.emit('director-auth', { pin: PIN }, res));
  check('director se autentica con PIN correcto', authRes && authRes.ok === true && Array.isArray(authRes.sectors));

  // Espera a que el director reciba el conteo actualizado del sector
  const counts = await new Promise((res) => director.once('sector-counts', res));
  check('director recibe conteo de fans por sector', counts && counts[SECTOR] === 1);

  // No-director no puede disparar flash
  const unauthorizedTry = await new Promise((res) => fan.emit('trigger-flash', { sectorId: SECTOR, color: '#FF0000' }, res));
  check('un fan (no director) no puede disparar flash', unauthorizedTry && unauthorizedTry.ok === false);

  // Flash dirigido al sector del fan
  const flashReceived = new Promise((res) => fan.once('flash', res));
  const triggerAck = await new Promise((res) =>
    director.emit('trigger-flash', { sectorId: SECTOR, color: '#ABCDEF', pattern: 'solid', duration: 1000 }, res)
  );
  check('director dispara flash exitosamente', triggerAck && triggerAck.ok === true);

  const flashPayload = await flashReceived;
  check('el fan recibe el evento flash con el color correcto', flashPayload.color === '#ABCDEF');

  // Fan de otro sector NO debe recibir el flash
  const otherFan = io(URL, { transports: ['websocket'] });
  await new Promise((res) => otherFan.on('connect', res));
  await new Promise((res) => otherFan.emit('join-sector', { sectorId: 'cancha' }, res));
  let otherReceived = false;
  otherFan.once('flash', () => { otherReceived = true; });

  await new Promise((res) => director.emit('trigger-flash', { sectorId: SECTOR, color: '#111111', pattern: 'solid', duration: 500 }, res));
  await new Promise((res) => setTimeout(res, 300));
  check('un fan de OTRO sector no recibe el flash dirigido', otherReceived === false);

  // Flash ALL llega a todos
  const allReceivedFan = new Promise((res) => fan.once('flash', res));
  const allReceivedOther = new Promise((res) => otherFan.once('flash', res));
  await new Promise((res) => director.emit('trigger-flash', { sectorId: 'ALL', color: '#FFFFFF', pattern: 'blink', duration: 500 }, res));
  const [p1, p2] = await Promise.all([allReceivedFan, allReceivedOther]);
  check('flash ALL llega a fans de distintos sectores', p1.color === '#FFFFFF' && p2.color === '#FFFFFF');

  fan.close();
  director.close();
  otherFan.close();

  console.log('\nResultado:', passed, 'pasaron,', failed, 'fallaron');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Error en test:', err);
  process.exit(1);
});
