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

La aplicación no usa backend. El correo Atlassian, API token, repositorios,
snapshot de actividad y notificaciones se guardan en `localStorage` del
navegador. El token se envía únicamente a `api.bitbucket.org` mediante Basic
Auth. Para crear el token usa los scopes `account:read`, `repository:read` y
`pullrequest:read`.

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

Una PWA completamente cerrada no puede ejecutar este sondeo frontend. Para
notificaciones con la aplicación cerrada se necesitaría un servicio de push
alimentado por webhooks de Bitbucket.
