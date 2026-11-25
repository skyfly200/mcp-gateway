import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { buildServer } from '../gateway/registry'
import { clientForToken } from '../utils/clients'

/**
 * MCP over streamable HTTP, stateless: a fresh server per request, so it fits
 * Vercel functions. Auth: "Authorization: Bearer <agent key>".
 */
export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const client = token ? await clientForToken(token) : null
  if (!client) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
    })
  }

  const server = await buildServer(client)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(toWebRequest(event))
})
