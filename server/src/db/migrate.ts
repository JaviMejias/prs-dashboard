import { readFile } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { pool } from './index.js'

const directory = path.resolve(process.cwd(), 'migrations')
const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()
for (const file of files) {
  await pool.query(await readFile(path.join(directory, file), 'utf8'))
  console.log(`Applied ${file}`)
}
await pool.end()
