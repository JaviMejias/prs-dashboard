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
```

La aplicación no usa backend. El correo Atlassian, API token, repositorios,
snapshot de actividad y notificaciones se guardan en `localStorage` del
navegador. El token se envía únicamente a `api.bitbucket.org` mediante Basic
Auth. Para crear el token usa los scopes `account:read`, `repository:read` y
`pullrequest:read`.
# prs-dashboard
