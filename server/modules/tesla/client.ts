import { decrypt, encrypt } from '../../utils/crypto'
import { db } from '../../utils/db'

// Token exchange host per Tesla's 2025-07-21 announcement. The sign-in page stays on auth.tesla.com.
export const TESLA_AUTHORIZE_URL = process.env.TESLA_AUTHORIZE_URL ?? 'https://auth.tesla.com/oauth2/v3/authorize'
export const TESLA_TOKEN_URL = process.env.TESLA_TOKEN_URL ?? 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token'
export const TESLA_SCOPES = 'openid offline_access user_data vehicle_device_data vehicle_location vehicle_cmds vehicle_charging_cmds'

export function apiBase(): string {
  return process.env.TESLA_API_BASE ?? 'https://fleet-api.prd.na.vn.cloud.tesla.com'
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TESLA_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (!res.ok) throw new Error(`Tesla token request failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<TokenResponse>
}

/** Store tokens encrypted. Tesla rotates refresh tokens, so always keep the newest one. */
export async function saveTokens(t: TokenResponse) {
  const expires = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString()
  await db()`
    INSERT INTO tesla_account (id, refresh_token, access_token, access_expires, scopes, updated_at)
    VALUES (1, ${encrypt(t.refresh_token)}, ${encrypt(t.access_token)}, ${expires}, ${t.scope ?? null}, now())
    ON CONFLICT (id) DO UPDATE SET
      refresh_token = EXCLUDED.refresh_token,
      access_token = EXCLUDED.access_token,
      access_expires = EXCLUDED.access_expires,
      scopes = COALESCE(EXCLUDED.scopes, tesla_account.scopes),
      updated_at = now()`
}

export async function exchangeCode(code: string) {
  const t = await tokenRequest({
    grant_type: 'authorization_code',
    client_id: required('TESLA_CLIENT_ID'),
    client_secret: required('TESLA_CLIENT_SECRET'),
    code,
    audience: apiBase(),
    redirect_uri: required('TESLA_REDIRECT_URI'),
  })
  await saveTokens(t)
}

/** Current owner access token, refreshed when needed. */
export async function fleetToken(): Promise<string> {
  const rows = (await db()`SELECT refresh_token, access_token, access_expires FROM tesla_account WHERE id = 1`) as {
    refresh_token: string, access_token: string | null, access_expires: string | null
  }[]
  const row = rows[0]
  if (!row) throw new Error('Tesla is not linked yet. Sign in at /api/auth/tesla/login.')
  if (row.access_token && row.access_expires && new Date(row.access_expires) > new Date()) {
    return decrypt(row.access_token)
  }
  const t = await tokenRequest({
    grant_type: 'refresh_token',
    client_id: required('TESLA_CLIENT_ID'),
    refresh_token: decrypt(row.refresh_token),
  })
  await saveTokens(t)
  return t.access_token
}

export class TeslaError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Call Fleet API with the owner's token. Returns the `response` field. */
export async function fleet<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiBase() + path, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${await fleetToken()}`, 'content-type': 'application/json' },
  })
  const text = await res.text()
  if (!res.ok) {
    const hint = res.status === 408 ? ' The car is asleep or offline.' : ''
    throw new TeslaError(res.status, `Tesla API ${res.status}.${hint} ${text.slice(0, 300)}`)
  }
  const json = JSON.parse(text) as { response: T }
  return json.response
}
