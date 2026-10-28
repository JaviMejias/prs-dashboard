import type { PullRequest, PullRequestActivity, ReviewHistoryPullRequest } from '../types'

export type HistoryManifest = {
  key: string
  scope: string
  year: number
  from: string
  to: string
  phase: 'listing' | 'activity' | 'complete'
  stateIndex: number
  next?: string
  visited?: string[]
  ids: number[]
  startedAt: number
  updatedAt: number
  force: boolean
  error?: string
  retryAt?: number
}
export type HistoryRecord = {
  key: string
  scope: string
  pr: PullRequest
  activity: PullRequestActivity[]
  version: string
  complete: boolean
  next?: string
  visited?: string[]
  readStartedAt: number
  history?: ReviewHistoryPullRequest
}
export type HistoryStoredData = { manifest?: HistoryManifest; records: HistoryRecord[] }
export interface HistoryImportStorage {
  read(scope: string, key: string): Promise<HistoryStoredData>
  write(manifest: HistoryManifest, records?: HistoryRecord[]): Promise<void>
  persistent: boolean
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const stringList = (value: unknown) => value === undefined || Array.isArray(value) && value.every((entry) => typeof entry === 'string')
const validManifest = (value: unknown, scope: string, key: string): value is HistoryManifest => object(value)
  && value.key === key && value.scope === scope && Number.isSafeInteger(value.year)
  && validDate(value.from) && validDate(value.to) && ['listing', 'activity', 'complete'].includes(String(value.phase))
  && (value.phase !== 'complete' || value.stateIndex === 3)
  && typeof value.stateIndex === 'number' && Number.isInteger(value.stateIndex) && value.stateIndex >= 0 && value.stateIndex <= 3
  && Array.isArray(value.ids) && value.ids.every((id) => Number.isSafeInteger(id) && id > 0)
  && typeof value.startedAt === 'number' && Number.isFinite(value.startedAt)
  && typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) && typeof value.force === 'boolean'
  && (value.next === undefined || typeof value.next === 'string') && stringList(value.visited)
  && (value.error === undefined || typeof value.error === 'string') && (value.retryAt === undefined || typeof value.retryAt === 'number' && Number.isFinite(value.retryAt))
const validRecord = (value: unknown, scope: string): value is HistoryRecord => object(value) && value.scope === scope
  && object(value.pr) && Number.isSafeInteger(value.pr.id) && value.key === `${scope}:${value.pr.id}`
  && typeof value.pr.title === 'string' && ['OPEN', 'MERGED', 'DECLINED'].includes(String(value.pr.state))
  && validDate(value.pr.created_on) && validDate(value.pr.updated_on)
  && (value.pr.participants === undefined || Array.isArray(value.pr.participants))
  && typeof value.version === 'string' && typeof value.complete === 'boolean'
  && typeof value.readStartedAt === 'number' && Number.isFinite(value.readStartedAt)
  && Array.isArray(value.activity) && value.activity.every(object) && stringList(value.visited)
  && (value.next === undefined || typeof value.next === 'string')
  && (!value.complete || object(value.history))
  && (value.history === undefined || object(value.history) && value.history.id === value.pr.id
    && typeof value.history.title === 'string' && ['OPEN', 'MERGED', 'DECLINED'].includes(String(value.history.state))
    && validDate(value.history.createdAt) && validDate(value.history.updatedOn) && (value.history.url === undefined || typeof value.history.url === 'string')
    && Array.isArray(value.history.events) && value.history.events.every((event) => object(event)
      && typeof event.id === 'string' && validDate(event.date) && ['comment', 'approval', 'review', 'changes_requested'].includes(String(event.type))
      && (event.reviewerUuid === undefined || typeof event.reviewerUuid === 'string') && (event.reviewerName === undefined || typeof event.reviewerName === 'string')
      && (event.source === undefined || event.source === 'activity' || event.source === 'participants')))

export function memoryHistoryStorage(persistent = false): HistoryImportStorage & { rememberRecords: (rows: HistoryRecord[]) => void } {
  const manifests = new Map<string, HistoryManifest>()
  const records = new Map<string, HistoryRecord>()
  return {
    persistent,
    rememberRecords: (rows) => rows.forEach((record) => records.set(record.key, structuredClone(record))),
    read: async (scope, key) => structuredClone({ manifest: manifests.get(key), records: [...records.values()].filter((record) => record.scope === scope) }),
    write: async (manifest, rows = []) => {
      manifests.set(manifest.key, structuredClone(manifest))
      rows.forEach((record) => records.set(record.key, structuredClone(record)))
    },
  }
}

function indexedHistoryStorage(): HistoryImportStorage {
  let connection: Promise<IDBDatabase> | undefined
  const database = () => {
    if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('prcr-review-history-v2', 1)
      open.onupgradeneeded = () => {
        open.result.createObjectStore('imports', { keyPath: 'key' })
        open.result.createObjectStore('records', { keyPath: 'key' }).createIndex('scope', 'scope')
      }
      open.onerror = () => reject(open.error)
      open.onblocked = () => reject(new Error('Otra pestaña impide abrir el historial local.'))
      open.onsuccess = () => {
        const db = open.result
        db.onversionchange = () => { db.close(); connection = undefined }
        resolve(db)
      }
    }).catch((reason: unknown) => { connection = undefined; throw reason })
    return connection
  }
  return {
    persistent: true,
    read: async (scope, key) => {
      const db = await database()
      return new Promise<HistoryStoredData>((resolve, reject) => {
        const transaction = db.transaction(['imports', 'records'], 'readonly')
        const manifest = transaction.objectStore('imports').get(key)
        const records = transaction.objectStore('records').index('scope').getAll(scope)
        transaction.oncomplete = () => resolve({
          manifest: validManifest(manifest.result, scope, key) ? manifest.result : undefined,
          records: (records.result as unknown[]).filter((record): record is HistoryRecord => validRecord(record, scope)),
        })
        transaction.onabort = () => reject(transaction.error || new Error('No se pudo leer el historial local.'))
        transaction.onerror = () => reject(transaction.error)
      })
    },
    write: async (manifest, records = []) => {
      const db = await database()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['imports', 'records'], 'readwrite')
        transaction.objectStore('imports').put(manifest)
        records.forEach((record) => transaction.objectStore('records').put(record))
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error || new Error('No se pudo guardar el avance del historial.'))
        transaction.onerror = () => reject(transaction.error)
      })
    },
  }
}

const durable = indexedHistoryStorage()
const fallback = memoryHistoryStorage()
let storageUnavailable = false
export const historyImportStorage: HistoryImportStorage = {
  get persistent() { return !storageUnavailable },
  read: async (scope, key) => {
    if (storageUnavailable) return fallback.read(scope, key)
    try {
      const data = await durable.read(scope, key)
      if (data.manifest) await fallback.write(data.manifest, data.records)
      else fallback.rememberRecords(data.records)
      return data
    } catch {
      storageUnavailable = true
      return fallback.read(scope, key)
    }
  },
  write: async (manifest, records = []) => {
    if (!storageUnavailable) {
      try { await durable.write(manifest, records) } catch { storageUnavailable = true }
    }
    await fallback.write(manifest, records)
  },
}
