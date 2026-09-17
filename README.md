# PR Control Room

PR Control Room es una herramienta personal para revisar Pull Requests de
Bitbucket Cloud con más rapidez y consistencia. Centraliza la cola de revisión,
explica quién debe actuar a continuación y prepara contexto para copiarlo a
Codex.

La aplicación es deliberadamente frontend-only: no tiene backend, cuentas,
OAuth, base de datos, Webhooks, Web Push ni sincronización remota. Bitbucket es
la fuente externa de Pull Requests y la configuración personal se conserva en
el navegador.

## Funcionalidades

- Cola priorizada con los PR más recientes primero.
- Estados de revisión: nuevo, requiere revisión, esperando al autor y revisado.
- Detección basada en commits, comentarios, respuestas y actividad de revisores.
- Filtros por estado de Bitbucket, repositorio y vista personal.
- Ignorar autores o Pull Requests y recuperar luego esa configuración.
- Resumen de actividad y revisiones por rango de fechas.
- Configuración de repositorios, tecnologías, autores y remotos locales.
- Rule Library, rulepacks y reglas personalizadas.
- Contexto completo del PR e instrucciones copiables para Codex.
- Instalación como PWA en desktop, Android e iOS.

## Stack

- React 18 + TypeScript.
- Vite 6 y pnpm 11.
- TanStack Query para carga y caché de Bitbucket.
- Vite PWA + Workbox para instalación, precache y actualización.
- Framer Motion para transiciones.
- Lucide React para iconografía.
- Vitest para pruebas unitarias.

## Requisitos

- Node.js 20.19 o superior.
- pnpm 11 o superior.
- Un API token de Bitbucket Cloud con estos permisos mínimos:
  - account:read
  - repository:read
  - pullrequest:read

Las versiones esperadas están declaradas en <code>package.json</code>. El gestor
oficial del proyecto es pnpm y el lockfile oficial es
<code>pnpm-lock.yaml</code>; no agregues un segundo lockfile ni uses npm para
instalar dependencias.

## Desarrollo local

~~~bash
corepack enable
pnpm install
pnpm dev
~~~

La aplicación estará disponible normalmente en
<code>http://localhost:5173</code>.

Para probar el build de producción:

~~~bash
pnpm build
pnpm preview --host 0.0.0.0
~~~

Validaciones disponibles:

~~~bash
pnpm test
pnpm build
~~~

## Primera configuración

1. Abre la aplicación.
2. Ingresa tu correo de Atlassian y tu API token de Bitbucket.
3. Agrega los repositorios usando su workspace y nombre.
4. En Preparar → Repositorios, configura tecnologías y versiones.
5. En Preparar → Reglas, revisa o crea reglas y asígnalas a repositorios.
6. Configura autores y remotos locales si usarás la guía de revisión con Git.

El token se usa directamente desde el navegador contra api.bitbucket.org
mediante Basic Auth. No se envía a este proyecto ni a un servidor intermedio.

## Arquitectura

~~~text
Bitbucket Cloud API
        ↓
  cliente Bitbucket
        ↓
 TanStack Query + estado React
        ↓
 Cola / Resumen / Preparar
        ↓
 ReviewContext + Markdown para Codex
~~~

La lógica de decisión vive en funciones TypeScript y <code>localStorage</code> es
la persistencia principal. No existe una API propia ni una arquitectura de
dominio inspirada en backend.

### Datos locales

Se guardan localmente repositorios, sesión, histórico de revisiones, snapshot
de actividad, notificaciones, preferencias, autores ignorados, aliases,
remotos, reglas personalizadas y asociaciones de reglas por repositorio.

Estos datos pertenecen al perfil del navegador y no se comparten entre PCs.
Borrar los datos del sitio puede eliminar la configuración.

El token queda en el navegador porque la aplicación no tiene backend. No debe
exportarse, compartirse ni incluirse en capturas. En un equipo compartido,
utiliza un perfil de navegador separado y revoca el token en Bitbucket cuando
ya no sea necesario.

## Cola y detección de revisión

La cola no interpreta cualquier actualización de Bitbucket como un cambio que
requiera revisión. Considera:

- la última revisión identificable del usuario actual;
- el commit revisado y el último commit del PR;
- commits posteriores del autor;
- comentarios y respuestas posteriores a la revisión;
- actividad de otros revisores;
- estado actual: OPEN, DRAFT, QUEUED, MERGED o DECLINED.

Las vistas personales significan:

- Necesitan revisión: PR nuevo o actividad posterior del autor.
- Esperando al dev: tu revisión es la actividad relevante más reciente y el
  autor aún no ha respondido con actividad posterior.
- Revisados: no hay una acción pendiente según la actividad conocida.
- Nuevo PR: no existe una revisión previa identificable.

Si Bitbucket entrega actividad incompleta, la interfaz debe indicarlo en lugar
de afirmar con certeza que hubo cambios.

## Sincronización y notificaciones

Mientras está abierta, la aplicación consulta Bitbucket cada 60 segundos,
vuelve a validar al recuperar el foco y permite actualización manual.

Las notificaciones locales se reservan para:

- un Pull Request nuevo;
- un cambio que vuelve a poner el PR en tu turno.

Las actualizaciones rutinarias no crean avisos. Al seleccionar una
notificación, la app intenta localizar el PR, ajustar los filtros, desplazarse
hasta él y resaltarlo temporalmente. Si ya no está cargado, conserva el enlace
a Bitbucket.

Al ser frontend-only, la aplicación no puede consultar Bitbucket ni generar
notificaciones con la pestaña o PWA completamente cerrada. El Service Worker
sostiene las capacidades de PWA, no ejecuta polling en segundo plano.

## Preparar

La vista Preparar agrupa la configuración del trabajo local:

- Repositorios: tecnologías, versiones y reglas asociadas.
- Autores: aliases y remotos locales de autores de Bitbucket.
- Reglas: biblioteca global y reglas personalizadas.

El contexto preparado puede incluir repositorio, ramas, estado, autor, fechas,
commits, archivos modificados, diffstat, comentarios, actividad y reglas
aplicables. Preparar para Codex genera Markdown para copiar manualmente; no
ejecuta Codex, Git ni comandos externos.

## Rule Library y rulepacks

Las reglas pueden ser globales o específicas del proyecto. Los repositorios
guardan referencias id@version, no copias completas del contenido.

Los rulepacks versionables viven en <code>rulepacks/</code> y se cargan desde Git
durante el build:

~~~text
rulepacks/
└── kontroller-official/
    ├── rulepack.json
    └── sources/
        ├── agents.md
        ├── kontroller-conventions.md
        └── ...
~~~

Las reglas locales se guardan en el navegador. Crea una nueva versión cuando
necesites conservar la trazabilidad de una regla anterior.

## Flujo local con Git

La aplicación puede mostrar una guía como:

~~~text
Revisemos este PR desde el remoto cosores, rama feature/mi-cambio, hacia el
remoto origin, rama propyme_production. Remotos actualizados.
~~~

Es una guía para el usuario. La aplicación no ejecuta git fetch, no crea
remotos y no modifica repositorios locales.

Si tienes configurado el alias correspondiente:

~~~bash
git sync-remotes
~~~

Los nombres de remotos son locales y deben configurarse en Preparar; no se
deducen de forma garantizada desde Bitbucket.

## PWA

El build genera un manifiesto y un único Service Worker mediante
<code>vite-plugin-pwa</code>. La estrategia actual conserva precache, offline y
actualización con aviso al usuario.

Para instalarla en desktop o Android debe publicarse mediante HTTPS.
<code>localhost</code> es una excepción válida únicamente en el mismo
dispositivo donde se ejecuta el servidor de desarrollo.

Flujo de actualización:

1. Se publica un nuevo build.
2. El Service Worker detecta la versión nueva.
3. La interfaz muestra Nueva versión disponible.
4. El usuario pulsa Actualizar ahora.
5. Se activa la versión nueva sin reinstalar ni borrar
   <code>localStorage</code>.

Si después de un despliegue aparece un 404 para un asset hashado, abre
Application → Service Workers en las herramientas del navegador, pulsa
Unregister, limpia los datos del sitio y vuelve a cargar la URL. Es un
procedimiento de recuperación para una caché antigua.

## Despliegue en Vercel

El repositorio incluye <code>vercel.json</code> con el contrato de despliegue:

- instalación: <code>pnpm install --frozen-lockfile</code>;
- build: <code>pnpm run build</code>;
- salida: <code>dist</code>;
- <code>index.html</code>, <code>sw.js</code> y el manifiesto no se sirven desde
  una caché antigua.

No se requieren variables de entorno. Las credenciales se introducen
localmente y permanecen en el navegador del usuario.

## Estructura relevante

~~~text
src/
├── components/       componentes de UI y vistas
├── hooks/             composición de estado y sincronización
├── lib/               API Bitbucket, almacenamiento y funciones puras
├── App.tsx            shell, navegación y composición
├── PwaManager.tsx     instalación y actualización PWA
├── main.tsx           entrypoint React
└── styles.css         tokens y estilos runtime

rulepacks/             reglas versionables en Git
schemas/               contratos JSON locales
docs/architecture/     decisiones arquitectónicas
public/icons/          iconos de instalación
~~~

## Solución de problemas

### pnpm dev falla antes de iniciar Vite

Comprueba Node y pnpm:

~~~bash
node --version
pnpm --version
~~~

Después reinstala respetando el lockfile:

~~~bash
pnpm install --frozen-lockfile
pnpm dev
~~~

### Bitbucket devuelve 401 o 403

Verifica el correo, regenera el API token y confirma los permisos mínimos.
No pegues el token en issues, logs ni capturas.

### Un PR aparece con un estado inesperado

Revisa la actividad disponible, la identidad del revisor, commits,
comentarios, respuestas y el snapshot local. Si falta actividad en la
respuesta de Bitbucket, la app puede mostrar confianza reducida.

### La cola está vacía

Revisa los filtros de estado, repositorio y vista personal. Comprueba también
que el autor o Pull Request no esté en la lista de ignorados.

## Alcance actual

Este proyecto no incluye backend, Web Push real, Webhooks de Bitbucket,
sincronización remota de configuración, ejecución automática de Codex ni
ejecución automática de Git. La portabilidad entre equipos se resuelve con
rulepacks versionados en Git y, cuando corresponda, exportación/importación de
configuración local sin credenciales.
