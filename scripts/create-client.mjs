// Create a bearer key for one agent. Prints the key once; only its hash is stored.
// Usage: DATABASE_URL=... node scripts/create-client.mjs <name> [read-glob ...] [--commands <glob> ...]
// Read tools default to all ('*'). Commands default to none.
// Examples:
//   node scripts/create-client.mjs research-bot 'tesla_get_*' tesla_list_vehicles
//   node scripts/create-client.mjs muse '*' --commands 'tesla_climate_*' tesla_set_temperature
//   node scripts/create-client.mjs home-agent '*' --commands 'tesla_*'
import { createHash, randomBytes } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

const args = process.argv.slice(2)
const name = args.shift()
if (!name || name.startsWith('--')) throw new Error('Usage: create-client.mjs <name> [read-glob ...] [--commands <glob> ...]')
const split = args.indexOf('--commands')
const reads = split === -1 ? args : args.slice(0, split)
const commands = split === -1 ? [] : args.slice(split + 1)

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const sql = neon(url)

const token = 'mcpg_' + randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')
const allowedTools = reads.length ? reads : ['*']
await sql`INSERT INTO mcp_clients (name, token_hash, allowed_tools, allowed_commands)
          VALUES (${name}, ${hash}, ${allowedTools}, ${commands})`
console.log(`Client "${name}"`)
console.log(`  read tools: ${allowedTools.join(', ')}`)
console.log(`  commands:   ${commands.length ? commands.join(', ') : 'none'}`)
console.log(`Bearer key (shown once, store it in the agent's config):\n${token}`)
