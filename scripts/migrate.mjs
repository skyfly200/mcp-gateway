// Apply db/schema.sql to DATABASE_URL. Safe to run again.
// Usage: DATABASE_URL=... node scripts/migrate.mjs
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const sql = neon(url)
const text = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
const statements = text
  .split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  .split(';').map(s => s.trim()).filter(Boolean)
for (const s of statements) await sql.query(s)
console.log(`Applied ${statements.length} statements.`)
