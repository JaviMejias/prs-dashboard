import { afterEach, describe, expect, it, vi } from 'vitest'
import { activatePwaUpdate, PWA_UPDATE_TIMEOUT_MS } from './pwaUpdate'

class WorkerStub extends EventTarget {
  state: ServiceWorkerState = 'installed'
  postMessage = vi.fn()
  setState(state: ServiceWorkerState) { this.state = state; this.dispatchEvent(new Event('statechange')) }
}
const workerAsServiceWorker = (worker: WorkerStub) => worker as unknown as ServiceWorker
const registration = (worker?: WorkerStub, phase: 'waiting' | 'installing' | 'active' = 'waiting') => ({
  [phase]: worker && workerAsServiceWorker(worker),
}) as unknown as ServiceWorkerRegistration

afterEach(() => { vi.useRealTimers() })

describe('PWA update activation', () => {
  it('waits for activation, not just for the update message to be sent', async () => {
    const worker = new WorkerStub()
    const done = vi.fn()
    const update = activatePwaUpdate(registration(worker), new AbortController().signal).then(done)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    worker.setState('activating')
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    worker.setState('activated')
    await update
    expect(done).toHaveBeenCalledOnce()
  })

  it('waits for installation before asking a worker to activate', async () => {
    const worker = new WorkerStub()
    worker.state = 'installing'
    const update = activatePwaUpdate(registration(worker, 'installing'), new AbortController().signal)
    expect(worker.postMessage).not.toHaveBeenCalled()
    worker.setState('installed')
    expect(worker.postMessage).toHaveBeenCalledOnce()
    worker.setState('activated')
    await update
  })

  it('handles a version that another tab has already activated', async () => {
    const worker = new WorkerStub()
    worker.state = 'activated'
    await expect(activatePwaUpdate(registration(worker, 'active'), new AbortController().signal)).resolves.toBeUndefined()
    expect(worker.postMessage).not.toHaveBeenCalled()
  })

  it('does not report success by falling back to the old active worker when the expected update failed', async () => {
    const old = new WorkerStub()
    old.state = 'activated'
    const update = new WorkerStub()
    update.state = 'redundant'
    await expect(activatePwaUpdate(registration(old, 'active'), new AbortController().signal, workerAsServiceWorker(update))).rejects.toThrow('dejó de estar disponible')
  })

  it('times out, removes its listeners and allows retry', async () => {
    vi.useFakeTimers()
    const worker = new WorkerStub()
    const removeListener = vi.spyOn(worker, 'removeEventListener')
    const update = activatePwaUpdate(registration(worker), new AbortController().signal)
    const failure = expect(update).rejects.toThrow('no terminó en 15 segundos')
    await vi.advanceTimersByTimeAsync(PWA_UPDATE_TIMEOUT_MS)
    await failure
    expect(removeListener).toHaveBeenCalledWith('statechange', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
    const retry = activatePwaUpdate(registration(worker), new AbortController().signal)
    worker.setState('activated')
    await retry
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an update when its component is removed', async () => {
    vi.useFakeTimers()
    const worker = new WorkerStub()
    const controller = new AbortController()
    const update = activatePwaUpdate(registration(worker), controller.signal)
    const failure = expect(update).rejects.toThrow('Unmounted')
    controller.abort(new Error('Unmounted'))
    await failure
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports message failures and missing workers', async () => {
    const worker = new WorkerStub()
    worker.postMessage.mockImplementation(() => { throw new Error('Cannot message worker') })
    await expect(activatePwaUpdate(registration(worker), new AbortController().signal)).rejects.toThrow('No se pudo activar')
    await expect(activatePwaUpdate(registration(), new AbortController().signal)).rejects.toThrow('No encontramos una versión')
  })
})
