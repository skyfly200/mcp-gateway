// Offline test of the gateway: tool list per agent allowlist, and one Tesla read tool.
// Fetch is faked for both Tesla and Neon, so no network or real car is used.
// Run: pnpm test
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

process.env.DATABASE_URL = 'postgresql://u:p@ep-test-123.us-east-2.aws.neon.tech/db'
process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64')
process.env.TESLA_CLIENT_ID = 'test-client'

const { encrypt } = await import('../server/utils/crypto')
const { buildServer } = await import('../server/gateway/registry')
const { toolAllowed } = await import('../server/utils/clients')

const calls: string[] = []
const future = new Date(Date.now() + 3600_000).toISOString()

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  calls.push(url)
  if (url.includes('neon.tech')) {
    const body = JSON.parse(String(init?.body ?? '{}'))
    if (String(body.query).includes('FROM tesla_account')) {
      return Response.json({
        fields: [
          { name: 'refresh_token', dataTypeID: 25 },
          { name: 'access_token', dataTypeID: 25 },
          { name: 'access_expires', dataTypeID: 25 },
        ],
        rows: [[encrypt('r'), encrypt('access-123'), future]],
        command: 'SELECT', rowCount: 1,
      })
    }
    return Response.json({ fields: [], rows: [], command: 'INSERT', rowCount: 1 })
  }
  if (url.includes('/vehicle_data_cached')) {
    const auth = new Headers(init?.headers).get('authorization')
    assert.equal(auth, 'Bearer access-123')
    return Response.json({ response: { state: 'asleep', charge_state: { battery_level: 72, charge_limit_soc: 80, secret_field: 'x' } } })
  }
  return new Response('not found', { status: 404 })
}) as typeof fetch

async function connect(allowedTools: string[]) {
  const server = await buildServer({ id: 1, name: 'test-agent', allowedTools })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(b)
  return client
}

test('globs', () => {
  assert.ok(toolAllowed('tesla_get_status', ['tesla_get_*']))
  assert.ok(!toolAllowed('tesla_unlock', ['tesla_get_*']))
  assert.ok(toolAllowed('anything', ['*']))
  assert.ok(!toolAllowed('tesla.get', ['tesla_get']))
})

test('allowlist limits the tool list', async () => {
  const all = await (await connect(['*'])).listTools()
  assert.deepEqual(all.tools.map(t => t.name).sort(), [
    'tesla_get_charge_state', 'tesla_get_climate_state', 'tesla_get_location', 'tesla_get_status', 'tesla_list_vehicles',
  ])
  assert.ok(all.tools.every(t => t.annotations?.readOnlyHint === true))
  const some = await (await connect(['tesla_get_charge_state'])).listTools()
  assert.deepEqual(some.tools.map(t => t.name), ['tesla_get_charge_state'])
})

test('charge state reads cached data and logs the call', async () => {
  calls.length = 0
  const client = await connect(['*'])
  const res = await client.callTool({ name: 'tesla_get_charge_state', arguments: { vin: '5YJ3E1EA0KF000000' } })
  assert.equal(res.isError, undefined)
  const data = JSON.parse((res.content as { text: string }[])[0].text)
  assert.deepEqual(data, { battery_level: 72, charge_limit_soc: 80 })
  assert.ok(calls.some(u => u.endsWith('/api/1/vehicles/5YJ3E1EA0KF000000/vehicle_data_cached')))
  assert.ok(calls.filter(u => u.includes('neon.tech')).length >= 2, 'token read and command_log insert')
})

test('a tool not on the allowlist cannot be called', async () => {
  const client = await connect(['tesla_list_vehicles'])
  const res = await client.callTool({ name: 'tesla_get_location', arguments: { vin: '5YJ3E1EA0KF000000' } })
  assert.equal(res.isError, true)
})
