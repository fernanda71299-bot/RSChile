# Fan Action — Romeo Santos 🎤✨

App web para coordinar un "fan action" en vivo durante el concierto: cada sector del recinto
tiene un color asignado, y desde un panel de control ("director") se dispara el flash en
tiempo real a un sector específico o a todo el estadio.

## ¿Qué incluye?

- **App del fan** (`/`): el asistente elige su sector desde el celular. Cuando el director
  dispara la señal, la pantalla se enciende del color del sector (y opcionalmente el flash
  físico de la cámara). También tiene un botón grande que el propio fan puede apretar cuando
  quiera para prender su flash por su cuenta, sin depender de la señal remota — funciona
  incluso si la conexión a internet falla, porque no necesita hablar con el servidor.
- **Panel del director** (`/director.html`): protegido con PIN, muestra cuántos fans están
  conectados por sector y tiene un botón de flash por sector + un botón de "Flash a todos".
- **Modal de bienvenida** la primera vez que alguien entra, y un pie de página con crédito —
  todo editable sin tocar código.
- **Instalable como app** (PWA): se puede agregar a la pantalla de inicio del celular.
- **Servidor en tiempo real** con Node.js + Socket.IO que conecta a todos los celulares.

## 1. Configurar tus sectores, textos y colores

Edita `config/sectors.json`:

```json
{
  "eventName": "Romeo Santos - Fan Action",
  "directorPin": "3535",
  "welcomeTitle": "¡Prepara tu flash!",
  "welcomeMessage": "Texto que ve el fan la primera vez que abre la app...",
  "credit": "Hecho con 💛 por fans de Romeo Santos",
  "sectors": [
    { "id": "platea-a", "name": "Platea Baja A", "color": "#FFD700" },
    { "id": "cancha", "name": "Cancha General", "color": "#FFFFFF" }
  ]
}
```

- `id`: identificador interno (sin espacios, minúsculas).
- `name`: lo que ve el fan en la lista.
- `color`: color hexadecimal que se usará como flash de ese sector.
- `directorPin`: cámbialo antes del evento para que nadie más controle el panel.
- `welcomeTitle` / `welcomeMessage`: el modal que aparece la primera vez que alguien abre la
  app (solo una vez por celular).
- `credit`: el texto que aparece al pie de la app del fan — cámbialo por el nombre de tu
  grupo o fan club si quieres.

No necesitas reiniciar el servidor tras editar el archivo si llamas a
`POST /api/reload-config` (o simplemente reinicia el servidor, es más simple).

## 2. Probarlo en tu computador

```bash
npm install
npm start
```

Abre `http://localhost:3000` (app del fan) y `http://localhost:3000/director.html`
(panel del director) en pestañas distintas.

## 3. Desplegarlo para el concierto (IMPORTANTE)

Los celulares de los fans necesitan conectarse a un servidor accesible por internet, y el
control de flash físico (linterna) **solo funciona sobre HTTPS**. La forma más simple y
gratuita:

### Opción recomendada: Render.com
1. Crea una cuenta gratis en render.com y conecta este proyecto (puedes subirlo a un
   repositorio de GitHub primero, o usar "Deploy from a Git repository").
2. Tipo de servicio: **Web Service**.
3. Build command: `npm install`
4. Start command: `npm start`
5. Render te da automáticamente una URL con HTTPS, por ejemplo
   `https://tu-fan-action.onrender.com`.

### Alternativas igual de válidas
- **Railway.app** (similar a Render, también gratis para empezar).
- **Fly.io**.
- Cualquier VPS con Node.js + un proxy con HTTPS (Nginx + Let's Encrypt, o Caddy).

Una vez desplegado:
- Comparte el link principal (`https://tu-app.onrender.com`) con el público, idealmente
  como **código QR** en las pantallas del recinto o en redes sociales antes del show.
- Tú (o la persona designada) entra a `https://tu-app.onrender.com/director.html` con el PIN
  desde tu propio celular o laptop para controlar el show en vivo.

> Nota sobre el plan gratuito de Render/Railway: el servidor "duerme" tras un rato sin uso.
> Ábrelo tú mismo 10-15 minutos antes de que empiece a llegar el público para que esté
> despierto y listo.

## 4. Instalar la app en el celular (PWA)

La app ya está configurada como **Progressive Web App**, así que cualquiera puede
"instalarla" sin pasar por App Store ni Google Play:

- **Android (Chrome)**: al entrar al link, va a aparecer un banner abajo con el botón
  **"Instalar"**. Al tocarlo, queda un ícono en la pantalla de inicio como cualquier app,
  y se abre a pantalla completa (sin la barra del navegador).
- **iPhone (Safari)**: Safari no permite instalar apps con un botón automático — el banner
  le va a indicar al usuario tocar el ícono de compartir (⬆️) y luego **"Agregar a
  pantalla de inicio"**.

Esto es completamente opcional: la app funciona igual de bien solo entrando al link cada
vez, instalarla solo hace más rápido el acceso durante el show.

## 5. El día del concierto

1. Entra al panel del director desde tu celular/laptop con buena señal o WiFi.
2. Verifica en el panel cuántos fans están conectados por sector (se actualiza en vivo).
3. Elige color, patrón (sólido o parpadeo) y duración en los controles superiores.
4. Toca el botón del sector que quieres encender, o "FLASH A TODOS" para el momento grande
   (por ejemplo, el coro de la canción más esperada).
5. Recuérdale al público, antes de empezar, que:
   - Suban el brillo de la pantalla al máximo.
   - Mantengan la app abierta (no la minimicen) durante la canción.
   - Si quieren el flash físico, activen el switch "Usar también el flash de la cámara" y
     acepten el permiso de cámara (funciona en la mayoría de Android con Chrome; en iPhone
     generalmente **no** está disponible por restricciones de Apple — la pantalla a color
     sigue funcionando igual en todos los teléfonos).

## Notas técnicas

- El flash físico (linterna) usa la Web API `applyConstraints({ torch: true })`, que solo
  funciona en HTTPS, con cámara trasera, y principalmente en navegadores basados en Chromium
  en Android. En iOS Safari no está soportado — es una limitación de Apple, no de esta app.
- El servidor no guarda datos personales de los fans: solo cuenta conexiones anónimas por
  sector para mostrarle al director cuántas personas hay conectadas.
- `test/e2e-test.js` es una prueba automática que simula fans y al director para verificar
  que las señales de flash lleguen al sector correcto. Ejecútala con el servidor corriendo:
  ```bash
  npm start &
  node test/e2e-test.js
  ```
