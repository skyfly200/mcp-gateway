import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { toolAllowed } from '../utils/clients'
import type { GatewayClient } from '../utils/clients'
import { db } from '../utils/db'
import { teslaModule } from '../modules/tesla/tools'
import type { GatewayModule, ToolDef } from './types'

/** Add new modules here. Phase 4 adds pass-through modules loaded from upstream_servers. */
const modules: GatewayModule[] = [teslaModule]

async function logCall(client: GatewayClient, tool: string, args: unknown, ok: boolean, error: string | null, ms: number) {
  try {
    await db()`INSERT INTO command_log (client_name, tool, args, ok, error, ms)
               VALUES (${client.name}, ${tool}, ${JSON.stringify(args ?? {})}, ${ok}, ${error}, ${ms})`
  }
  catch (e) {
    console.error('command_log insert failed', e)
  }
}

function asText(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

/** Build an MCP server that holds only the tools this agent may use. */
export async function buildServer(client: GatewayClient): Promise<McpServer> {
  const server = new McpServer({ name: 'mcp-gateway', version: '0.1.0' })

  for (const mod of modules) {
    const tools: ToolDef[] = await mod.tools()
    for (const tool of tools) {
      if (!toolAllowed(tool.name, client.allowedTools)) continue
      const input = { ...(tool.input ?? {}) }
      if (tool.risk === 'sensitive') {
        input.confirm = z.literal(true).describe('Must be true. Confirms the user asked for this action.')
      }
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: input,
          annotations: {
            readOnlyHint: tool.risk === 'read',
            destructiveHint: tool.risk === 'sensitive',
            openWorldHint: true,
            ...tool.annotations,
          },
        },
        async (args: Record<string, unknown>) => {
          const start = Date.now()
          try {
            const result = await tool.run(args, { client })
            await logCall(client, tool.name, args, true, null, Date.now() - start)
            return asText(result)
          }
          catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await logCall(client, tool.name, args, false, message, Date.now() - start)
            return { ...asText(`Error: ${message}`), isError: true }
          }
        },
      )
    }
  }
  return server
}
