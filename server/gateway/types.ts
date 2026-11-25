import type { ZodRawShape } from 'zod'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { GatewayClient } from '../utils/clients'

export interface ToolContext {
  client: GatewayClient
}

/**
 * One tool served by the gateway. Names carry the module prefix, e.g. tesla_get_status.
 * risk: 'read' changes nothing; 'command' changes the device; 'sensitive' (unlock, trunk)
 * must be called with confirm: true.
 */
export interface ToolDef {
  name: string
  title?: string
  description: string
  input?: ZodRawShape
  risk: 'read' | 'command' | 'sensitive'
  annotations?: ToolAnnotations
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

/** A gateway module: native (like Tesla) or, later, a pass-through to another MCP server. */
export interface GatewayModule {
  id: string
  tools: () => ToolDef[] | Promise<ToolDef[]>
}
