import { sha256 } from './crypto'
import { db } from './db'

export interface GatewayClient {
  id: number
  name: string
  allowedTools: string[]
}

/** Look up the agent that owns this bearer key. Returns null for unknown or revoked keys. */
export async function clientForToken(token: string): Promise<GatewayClient | null> {
  const rows = (await db()`
    SELECT id, name, allowed_tools FROM mcp_clients
    WHERE token_hash = ${sha256(token)} AND revoked_at IS NULL
    LIMIT 1`) as { id: number, name: string, allowed_tools: string[] }[]
  const row = rows[0]
  return row ? { id: row.id, name: row.name, allowedTools: row.allowed_tools } : null
}

/** Glob match with '*' only. 'tesla_get_*' matches 'tesla_get_status'. */
export function toolAllowed(tool: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    const re = new RegExp('^' + p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
    return re.test(tool)
  })
}
