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
# prs-dashboard
