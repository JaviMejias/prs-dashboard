export function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'pr-control-room-server', event, ...fields }))
}
