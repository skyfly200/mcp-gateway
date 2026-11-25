// Create a bearer key for one agent. Prints the key once; only its hash is stored.
// Usage: DATABASE_URL=... node scripts/create-client.mjs <name> [tool-glob ...]
// Example: node scripts/create-client.mjs muse 'tesla_*'
//          node scripts/create-client.mjs research-bot 'tesla_get_*' tesla_list_vehicles
import { createHash, randomBytes } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

const [name, ...globs] = process.argv.slice(2)
if (!name) throw new Error('Usage: create-client.mjs <name> [tool-glob ...]')
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const sql = neon(url)

const token = 'mcpg_' + randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')
const allowed = globs.length ? globs : ['*']
await sql`INSERT INTO mcp_clients (name, token_hash, allowed_tools) VALUES (${name}, ${hash}, ${allowed})`
console.log(`Client "${name}" can use: ${allowed.join(', ')}`)
console.log(`Bearer key (shown once, store it in the agent's config):\n${token}`)
