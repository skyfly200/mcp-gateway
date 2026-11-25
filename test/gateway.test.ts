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
process.env.TESLA_COMMAND_PROXY_URL = 'https://proxy.test'

const { encrypt } = await import('../server/utils/crypto')
const { buildServer } = await import('../server/gateway/registry')
const { toolAllowed } = await import('../server/utils/clients')
const { toCelsius } = await import('../server/modules/tesla/command-tools')

const posted: { url: string, body: unknown }[] = []
let carResult: { result: boolean, reason?: string } = { result: true, reason: '' }

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
  if (url.startsWith('https://proxy.test/')) {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer access-123')
    posted.push({ url, body: JSON.parse(String(init?.body ?? '{}')) })
    return Response.json({ response: carResult })
  }
  if (url.includes('/vehicle_data_cached')) {
    const auth = new Headers(init?.headers).get('authorization')
    assert.equal(auth, 'Bearer access-123')
    return Response.json({ response: { state: 'asleep', charge_state: { battery_level: 72, charge_limit_soc: 80, secret_field: 'x' } } })
  }
  return new Response('not found', { status: 404 })
}) as typeof fetch

async function connect(allowedTools: string[], allowedCommands: string[] = []) {
  const server = await buildServer({ id: 1, name: 'test-agent', allowedTools, allowedCommands })
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

const VIN = '5YJ3E1EA0KF000000'

function text(res: unknown) {
  return ((res as { content: { text: string }[] }).content)[0].text
}

test('commands are hidden by default, even with a * read list', async () => {
  const names = (await (await connect(['*'])).listTools()).tools.map(t => t.name)
  assert.ok(names.every(n => ['tesla_list_vehicles', 'tesla_get_status', 'tesla_get_charge_state', 'tesla_get_climate_state', 'tesla_get_location'].includes(n)))
  const client = await connect(['*'])
  const res = await client.callTool({ name: 'tesla_climate_on', arguments: { vin: VIN } })
  assert.equal(res.isError, true)
})

test('allowed_commands opens only the matching commands', async () => {
  const names = (await (await connect([], ['tesla_climate_*', 'tesla_set_temperature'])).listTools()).tools.map(t => t.name).sort()
  assert.deepEqual(names, ['tesla_climate_off', 'tesla_climate_on', 'tesla_set_temperature'])
  const all = (await (await connect(['*'], ['tesla_*'])).listTools()).tools
  assert.equal(all.filter(t => !t.annotations?.readOnlyHint).length, 15)
})

test('fahrenheit converts to half-degree celsius', () => {
  assert.equal(toCelsius(70, 'F'), 21)
  assert.equal(toCelsius(72, 'F'), 22)
  assert.equal(toCelsius(21.3, 'C'), 21.5)
})

test('climate and charging commands send the proxy parameters', async () => {
  posted.length = 0
  carResult = { result: true }
  const c = await connect([], ['tesla_*'])
  const calls: [string, Record<string, unknown>, string, unknown][] = [
    ['tesla_climate_on', {}, 'auto_conditioning_start', {}],
    ['tesla_set_temperature', { driver: 70 }, 'set_temps', { driver_temp: 21, passenger_temp: 21 }],
    ['tesla_set_seat_heater', { seat: 'rear_center', level: 2 }, 'remote_seat_heater_request', { seat_position: 4, level: 2 }],
    ['tesla_set_seat_cooler', { seat: 'front_right', level: 3 }, 'remote_seat_cooler_request', { seat_position: 2, seat_cooler_level: 4 }],
    ['tesla_set_climate_keeper', { mode: 'dog' }, 'set_climate_keeper_mode', { climate_keeper_mode: 2 }],
    ['tesla_set_defrost', { on: true }, 'set_preconditioning_max', { on: true }],
    ['tesla_set_charge_limit', { percent: 80 }, 'set_charge_limit', { percent: 80 }],
    ['tesla_set_charging_amps', { amps: 16 }, 'set_charging_amps', { charging_amps: 16 }],
    ['tesla_charge_stop', {}, 'charge_stop', {}],
  ]
  for (const [tool, args, cmd, body] of calls) {
    const res = await c.callTool({ name: tool, arguments: { vin: VIN, ...args } })
    assert.equal(res.isError, undefined, `${tool}: ${text(res)}`)
    const last = posted.at(-1)!
    assert.equal(last.url, `https://proxy.test/api/1/vehicles/${VIN}/command/${cmd}`)
    assert.deepEqual(last.body, body)
  }
})

test('a refused command is an error, and input limits hold', async () => {
  const c = await connect([], ['tesla_*'])
  carResult = { result: false, reason: 'cable not connected' }
  const res = await c.callTool({ name: 'tesla_charge_start', arguments: { vin: VIN } })
  assert.equal(res.isError, true)
  assert.match(text(res), /cable not connected/)
  carResult = { result: true }
  const bad = await c.callTool({ name: 'tesla_set_charge_limit', arguments: { vin: VIN, percent: 30 } })
  assert.equal(bad.isError, true)
  const hot = await c.callTool({ name: 'tesla_set_temperature', arguments: { vin: VIN, driver: 95 } })
  assert.equal(hot.isError, true)
})

test('without the proxy, commands explain what is missing', async () => {
  const saved = process.env.TESLA_COMMAND_PROXY_URL
  delete process.env.TESLA_COMMAND_PROXY_URL
  const c = await connect([], ['tesla_*'])
  const res = await c.callTool({ name: 'tesla_climate_on', arguments: { vin: VIN } })
  assert.equal(res.isError, true)
  assert.match(text(res), /signing proxy/)
  process.env.TESLA_COMMAND_PROXY_URL = saved
})
