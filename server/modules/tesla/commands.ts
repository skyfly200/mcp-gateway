import { Agent } from 'undici'
import { fleet, fleetToken, TeslaError } from './client'

/**
 * Signed vehicle commands go through Tesla's vehicle-command proxy (tesla-http-proxy),
 * which holds the app private key and signs each command. Phase 2 runs it on Fly.
 * Env: TESLA_COMMAND_PROXY_URL, e.g. https://tesla-proxy.fly.dev
 *      TESLA_COMMAND_PROXY_CA (optional) PEM of the proxy's self-signed TLS cert.
 */
const TIMEOUT_MS = 20_000

let dispatcher: Agent | undefined
function proxyDispatcher(): Agent | undefined {
  const ca = process.env.TESLA_COMMAND_PROXY_CA?.replace(/\\n/g, '\n')
  if (!ca) return undefined
  dispatcher ??= new Agent({ connect: { ca } })
  return dispatcher
}

interface CommandResponse {
  result: boolean
  reason?: string
}

/**
 * Send one signed command. Never retried: a command that times out may still have run on the car.
 */
export async function sendCommand(vin: string, command: string, body: Record<string, unknown> = {}) {
  const proxy = process.env.TESLA_COMMAND_PROXY_URL
  if (!proxy) {
    throw new Error('Commands need the signing proxy, which is not set up yet (TESLA_COMMAND_PROXY_URL is empty). See SETUP.md phase 2.')
  }
  const url = `${proxy.replace(/\/$/, '')}/api/1/vehicles/${encodeURIComponent(vin)}/command/${command}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${await fleetToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // undici option; ignored by other fetch implementations.
      ...({ dispatcher: proxyDispatcher() } as Record<string, unknown>),
    })
  }
  catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`No answer from the car in ${TIMEOUT_MS / 1000}s. The command may still have run. Check the state before trying again.`)
    }
    throw e
  }
  const text = await res.text()
  if (res.status === 408) throw new TeslaError(408, 'The car is asleep or offline. Call tesla_wake_vehicle first (costs one wake).')
  if (!res.ok) throw new TeslaError(res.status, `Command ${command} failed: ${res.status} ${text.slice(0, 300)}`)
  const json = JSON.parse(text) as { response?: CommandResponse }
  if (!json.response?.result) {
    throw new Error(`Car refused ${command}: ${json.response?.reason || 'no reason given'}`)
  }
  return { ok: true, command }
}

/** Wake is a plain Fleet API call (not signed). Tesla bills 50 wakes per $1 and limits 3 per minute. */
export async function wake(vin: string) {
  const r = await fleet<{ state?: string }>(`/api/1/vehicles/${encodeURIComponent(vin)}/wake_up`, { method: 'POST' })
  return { state: r?.state ?? 'unknown', note: 'The car can take up to 30 seconds to come online. Check with tesla_list_vehicles.' }
}


