import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, CheckCircle2, CircleAlert, Eye, EyeOff, GitCommitHorizontal, GitPullRequest, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { verifyUser } from '../lib/bitbucket'
import { createBackendSession } from '../lib/push'
import type { Session } from '../types'

function midnightTomorrow() {
  const date = new Date()
  date.setHours(24, 0, 0, 0)
  return date.getTime()
}

export default function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showToken, setShowToken] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!email.trim() || !token) {
      setError('Completa el correo y el API token para continuar.')
      return
    }
    setBusy(true)
    try {
      const draft = { email: email.trim(), token, expiresAt: midnightTomorrow() }
      const user = await verifyUser(draft)
      const session = { ...draft, uuid: user.uuid, displayName: user.display_name }
      await createBackendSession({ email: draft.email, token: draft.token })
      onLogin(session)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo verificar la cuenta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-story" aria-labelledby="login-title">
        <div className="brand brand-login">
          <span className="brand-mark"><GitPullRequest size={20} /></span>
          <span className="brand-copy">
            <strong>PR Control Room</strong>
            <small>Bitbucket review intelligence</small>
          </span>
        </div>
        <div className="login-narrative">
          <div className="login-thesis">
            <span className="section-kicker">Tu turno. Sin adivinar.</span>
            <h1 id="login-title">Controla el relevo de cada revisión.</h1>
            <p>Una cola precisa para saber qué cambió, quién actuó al final y qué necesita tu atención.</p>
          </div>
          <div className="handoff-demo" aria-label="Ejemplo del flujo de revisión">
            <div className="handoff-demo-step is-complete">
              <span><GitCommitHorizontal size={16} /></span>
              <div><strong>El autor publica cambios</strong><small>Actividad detectada</small></div>
              <CheckCircle2 size={16} />
            </div>
            <div className="handoff-demo-line" />
            <div className="handoff-demo-step is-active">
              <span><UserRound size={16} /></span>
              <div><strong>Tu revisión queda pendiente</strong><small>El siguiente turno es tuyo</small></div>
              <ArrowRight size={16} />
            </div>
          </div>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="connection-title">
        <div className="login-panel-heading">
          <span className="section-kicker">Conexión segura</span>
          <h2 id="connection-title">Entra con Bitbucket</h2>
          <p>Usa tu correo de Atlassian y un API token de solo lectura.</p>
        </div>
        <form onSubmit={submit} noValidate>
          <label className="field" htmlFor="atlassian-email">
            <span>Correo Atlassian</span>
            <input
              id="atlassian-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (error) setError('')
              }}
              placeholder="tu@empresa.com"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </label>
          <label className="field" htmlFor="api-token">
            <span>API token</span>
            <span className="secret-control">
              <input
                id="api-token"
                type={showToken ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={token}
                onChange={(event) => {
                  setToken(event.target.value)
                  if (error) setError('')
                }}
                placeholder="••••••••••••••••"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
              />
              <button
                type="button"
                className="secret-toggle"
                aria-label={showToken ? 'Ocultar API token' : 'Mostrar API token'}
                aria-pressed={showToken}
                onClick={() => setShowToken((visible) => !visible)}
              >
                {showToken ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          {error && <div className="form-error" id="login-error" role="alert"><CircleAlert size={17} /> {error}</div>}
          <button type="submit" className="button button-primary button-full" disabled={busy} aria-busy={busy}>
            {busy ? <><RefreshCw className="spin" size={17} /> Verificando…</> : <><ShieldCheck size={17} /> Conectar con Bitbucket</>}
          </button>
        </form>
        <p className="privacy-note"><ShieldCheck size={15} /> El token se usa en memoria para Bitbucket y la sesión del servidor se mantiene en una cookie HttpOnly.</p>
      </section>
    </main>
  )
}
