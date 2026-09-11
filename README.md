# PR Control Room

Dashboard frontend para centralizar pull requests de Bitbucket Cloud.

## Desarrollo

```bash
corepack enable
pnpm install
pnpm dev
```

Build de producción:

```bash
pnpm build
pnpm preview --host 0.0.0.0
```

## PWA

El build genera el manifiesto y el service worker necesarios para instalar la
aplicación en escritorio, Android e iOS. Las nuevas versiones se descargan en
segundo plano y la interfaz muestra un aviso para aplicarlas sin reinstalar ni
eliminar los datos locales.

Para instalarla desde otro dispositivo, especialmente un celular, debe estar
publicada mediante HTTPS. `localhost` funciona como excepción únicamente en el
mismo dispositivo donde se ejecuta el servidor.

La Fase 1 incorpora un backend Fastify en `server/` para identidad, sesiones
HttpOnly y Web Push. El API token se usa en memoria para las consultas actuales
de Bitbucket y no se persiste en `localStorage`; la sesión del backend no
contiene el token. Para crear el token usa los scopes `account:read`,
`repository:read` y `pullrequest:read`.

### Backend y Push

Requisitos: Node 20+, pnpm 11+ y PostgreSQL. Copia `server/.env.example` a
`server/.env`, completa `DATABASE_URL`, `SESSION_SECRET` y las claves VAPID,
y ejecuta:

```bash
pnpm install
pnpm db:migrate
pnpm dev:server
```

## Docker

Hay dos Compose separados. Desarrollo conserva puertos únicamente en
loopback y usa su propio volumen:

```bash
cp server/.env.development.example server/.env.development
docker compose -f docker-compose.development.yml up --build -d
docker compose -f docker-compose.development.yml run --rm backend node dist/db/migrate.js
```

La configuración productiva está en `docker-compose.production.yml`. Requiere
una red Docker externa compartida con Nginx Proxy Manager (en la infraestructura
actual `nginx-proxy-manager_default`) y las variables de
`server/.env.production.example` cargadas como
variables del Stack en Portainer. No publica el backend ni PostgreSQL en el
host; solo `frontend` y `backend` pertenecen a la red `proxy`, mientras
PostgreSQL permanece exclusivamente en `pr-control-room-network`.

Para validar la configuración antes de crear el Stack:

```bash
docker network create nginx-proxy-manager_default # solo si todavía no existe
docker compose --env-file .env.production -f docker-compose.production.yml config
```

El Stack incluye el servicio one-shot `migrate`, que espera a que PostgreSQL
esté saludable y ejecuta las migraciones antes de iniciar el backend. Para una
ejecución manual o para recuperar una migración, también puedes usar:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml run --rm backend node dist/db/migrate.js
```

El volumen `pr_control_room_postgres_data` es persistente y PostgreSQL no tiene
ningún `ports` publicado. Para actualizar, recrea el Stack con la nueva imagen
y conserva el volumen; no uses opciones que eliminen volúmenes.

### Despliegue automático desde GitHub

Configura el Stack de producción en Portainer usando este repositorio Git, la
rama `main` y `docker-compose.production.yml`. En GitOps Updates selecciona
`Webhook` y copia la URL generada. En GitHub crea un Environment llamado
`production` y agrega esa URL como secret con el nombre
`PORTAINER_STACK_WEBHOOK`. El workflow
`.github/workflows/deploy-production.yml` llamará el webhook en cada push a
`main`; Portainer hará pull, reconstruirá las imágenes y recreará el Stack. Las
variables de producción deben seguir configuradas en Portainer, nunca en Git.

El workflow no tiene acceso SSH al servidor. Si el webhook falta o falla, el
job termina con error y los containers actuales permanecen ejecutándose. La
concurrencia evita dos redeploys simultáneos.

### Nginx Proxy Manager y Cloudflare

En Nginx Proxy Manager crea un Proxy Host para `pr.javiermejias.com` con
Forward Hostname `frontend` y Forward Port `80`. El container de NPM debe estar
conectado a la misma red Docker externa `nginx-proxy-manager_default`; no uses
IPs de containers.

Agrega una Custom Location `/api` apuntando al hostname `backend`, puerto
`8787`, usando HTTP interno. La ubicación `/api` debe tener prioridad sobre la
ubicación `/`. Solicita el certificado Let's Encrypt en NPM, activa Force SSL y
usa HTTP/2 si está disponible.

En Cloudflare usa SSL/TLS `Full (strict)`. No uses `Flexible`. Evita cachear
`/api/*`, `/sw.js` y `/manifest.webmanifest`; el Service Worker necesita poder
comprobar actualizaciones. El origen debe permitir salida HTTPS hacia Bitbucket
y los proveedores Web Push.

En otra terminal ejecuta `pnpm dev`. Vite proxifica `/api` al backend en el
puerto 8787. La sección Diagnóstico Push de Configuración registra y revoca
dispositivos, muestra el estado de ambos lados y permite enviar un Push de
prueba. El backend elimina lógicamente suscripciones que respondan 404/410.

Genera las claves VAPID con:

```bash
pnpm --dir server exec web-push generate-vapid-keys
```

La private key solo vive en `server/.env`; la public key se entrega mediante
`GET /api/push/vapid-public-key`. Para probar Android, abre la PWA desde HTTPS
(o una URL de túnel HTTPS), inicia sesión, instálala, concede permisos y activa
Notificaciones del sistema. Repite en PC: el diagnóstico debe mostrar dos
dispositivos. Pulsa Enviar Push de prueba y minimiza/cierra Android.

## Sincronización y notificaciones

La cola consulta Bitbucket cada 60 segundos mientras la aplicación permanece
activa, incluso si la pestaña está en segundo plano cuando el navegador lo
permite. También vuelve a validar al recuperar el foco y admite actualización
manual. Solo genera avisos para PR nuevos o cuando un cambio hace que vuelva a
ser turno del usuario; las actualizaciones rutinarias no se notifican.

Abrir el panel no marca toda la bandeja como leída. Al seleccionar un aviso, la
aplicación localiza el PR, ajusta los filtros necesarios, desplaza la cola hasta
él y lo resalta temporalmente. Si ya cambió de estado se muestra el estado real;
si dejó de estar disponible en los datos cargados, se conserva el enlace a
Bitbucket como vía de recuperación.

Los avisos conservan el evento que los originó, pero su badge refleja el estado
actual del PR. Cuando queda esperando al autor, revisado, ignorado, en borrador,
en cola, fusionado o rechazado, el aviso se marca automáticamente como resuelto
y deja de sumar al contador de notificaciones pendientes.

El polling sigue siendo exclusivamente una actualización de la interfaz cada
60 segundos. El Push de Fase 1 funciona de forma independiente mediante el
Service Worker incluso con la PWA cerrada, pero todavía solo existe el evento
de prueba; los webhooks y las reglas de Bitbucket quedan para la Fase 2.
