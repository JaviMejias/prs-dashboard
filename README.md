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

La lógica de decisión vive en funciones TypeScript y el navegador es la
persistencia principal. La configuración y el historial usan <code>localStorage</code>;
la sesión de Bitbucket usa <code>sessionStorage</code> y desaparece al cerrar la
pestaña. No existe una API propia ni una arquitectura de dominio inspirada en
backend.

### Datos locales

Se guardan localmente repositorios, histórico de revisiones, snapshot de
actividad, notificaciones, preferencias, autores ignorados, aliases,
remotos, reglas personalizadas y asociaciones de reglas por repositorio.

La sesión de Bitbucket se mantiene únicamente mientras la pestaña esté abierta
mediante <code>sessionStorage</code>; al cerrarla tendrás que volver a ingresar.

Estos datos pertenecen al perfil del navegador y no se comparten entre PCs.
Borrar los datos del sitio puede eliminar la configuración.

El token se usa directamente desde el navegador porque la aplicación no tiene
backend. No debe exportarse, compartirse ni incluirse en capturas. En un equipo
compartido, utiliza un perfil de navegador separado y revoca el token en
Bitbucket cuando ya no sea necesario.

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

Mientras está abierta, la cola consulta Bitbucket cada 10 minutos,
vuelve a validar al recuperar el foco y permite actualización manual.

Resumen empieza por el mes actual y solo consulta meses anteriores cuando los
seleccionas. Su caché mensual se guarda por cuenta de Bitbucket, repositorio y
zona horaria; seleccionar un año reutiliza los meses ya consultados. El rango
se conserva al cambiar de vista y navegar no vuelve a descargarlo. El mes
actual se actualiza cada 10 minutos mientras Resumen está abierto; los demás
meses se actualizan con `Actualizar período`. `Recargar período` también
vuelve a leer la actividad de los PR sin borrar los datos si falla.

La comparación con el período anterior de igual duración no se descarga hasta
pedirla; los deltas también pueden aprovechar una cobertura que ya esté
guardada. Los errores, la cobertura parcial y los problemas de persistencia se
indican en la vista. El histórico antiguo no se mezcla con la nueva caché,
porque no permite atribuir con seguridad su cobertura a una cuenta.

Bitbucket permite filtrar la lista de PR por fechas, pero la actividad de cada
PR requiere lecturas adicionales. Se buscan PR actualizados desde el inicio
del mes y creados antes de su final: un PR revisado antes y modificado después
no debe desaparecer del resumen. La caché respeta las métricas existentes;
no reconstruye decisiones antiguas que Bitbucket ya no exponga.

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

Preparar muestra una ficha por proyecto: contexto, arquitectura, versiones,
criterios de revisión, evidencia y dudas. Mis preferencias se guardan una sola
vez y cada ficha decide si aplicarlas. Git, autores y la biblioteca anterior
siguen disponibles en Configuración avanzada.

Para conocer un proyecto nuevo:

1. Usa Conocer proyecto y pega la instrucción en Codex dentro de su carpeta.
2. En Editar ficha, abre Pegar el resultado de Codex y revisa su JSON.
3. Corrige el borrador y pulsa Guardar ficha. No se aplica automáticamente.

El reconocimiento es limitado y de solo lectura, no una auditoría global.
La app no analiza la carpeta ni ejecuta Codex. Las referencias oficiales deben
corresponder a la versión detectada; una fuente de una serie, como Ruby 2.4,
no se presenta como documentación exacta del parche 2.4.3.

Copiar para Codex y Descargar AGENTS.md generan el mismo contexto del proyecto,
incluidas sus reglas seleccionadas. No escriben archivos en tu repositorio.
La ficha también se incorpora al contexto de los PR sin volver a descargar la
cola. Una preferencia personal no tiene prioridad sobre una convención
verificada del proyecto y los conflictos deben señalarse explícitamente.

Descargar respaldo guarda fichas, tecnologías, preferencias, selecciones y
copias de las reglas en JSON portable v2. Restaurar muestra una vista previa y
permite conservar lo actual o usar el respaldo; no elimina otros proyectos.
La escritura es atómica y ofrece Deshacer hasta la siguiente edición. Las
bibliotecas antiguas de reglas se importan desde las opciones avanzadas.

Todo queda solo en este navegador: guarda el respaldo fuera de tu PC antes de
formatear. No hay sincronización automática. El respaldo no incluye la sesión,
los aliases Git ni metadata de rutas de este equipo. Revisa los textos libres
antes de compartirlos; no son filtrados automáticamente para detectar secretos.

El contexto preparado puede incluir repositorio, ramas, estado, autor, fechas,
commits, archivos modificados, diffstat, comentarios, actividad y reglas
aplicables. Copiar para Codex genera Markdown para copiar manualmente; no
ejecuta Codex, Git ni comandos externos.

En Revisión local, `Copiar para Codex` descarga bajo demanda el contexto de ese
PR: descripción, cambios y conversaciones, con las respuestas directas y
anidadas a tus observaciones. `Ver contexto` permite previsualizar la misma
guía y actualizar sus datos. Si fallan los comentarios, la copia combinada se
bloquea para no omitir silenciosamente las respuestas del desarrollador.

La guía identifica Chile cuando el destino empieza por `propyme` o `pine`,
Perú para `peru`, y Perú inferido para los demás destinos, advirtiendo posibles
excepciones. Incluye aliases locales, repositorios y ramas, y distingue una
declaración de remotos actualizados de una comprobación automática.

El campo opcional Contexto adicional permite pegar respuestas de WhatsApp o
recordar observaciones anteriores. No conecta con WhatsApp ni guarda la nota:
se mantiene al contraer la guía, pero se pierde al salir de la cola o recargar.
Los comentarios y notas se entregan a Codex como datos a contrastar con el
código, no como evidencia de que el problema ya se resolvió.

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
Revisión del PR #1886: KON-1886 Validar descuentos.
Origen: repositorio del autor, remoto cosores, rama KON-1886.
Base: repositorio del equipo, remoto origin, rama propyme_production.
Destino: Chile (según la rama destino).
Incluye descripción, commits, archivos, comentarios y seguimiento de respuestas.
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
