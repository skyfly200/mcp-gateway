// One-time: register the partner domain with Tesla, after the public key is live.
// Usage: TESLA_CLIENT_ID=... TESLA_CLIENT_SECRET=... TESLA_PARTNER_DOMAIN=... node scripts/register-partner.mjs
const base = process.env.TESLA_API_BASE ?? 'https://fleet-api.prd.na.vn.cloud.tesla.com'
const tokenUrl = process.env.TESLA_TOKEN_URL ?? 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token'
const { TESLA_CLIENT_ID, TESLA_CLIENT_SECRET, TESLA_PARTNER_DOMAIN } = process.env
if (!TESLA_CLIENT_ID || !TESLA_CLIENT_SECRET || !TESLA_PARTNER_DOMAIN) {
  throw new Error('Set TESLA_CLIENT_ID, TESLA_CLIENT_SECRET and TESLA_PARTNER_DOMAIN')
}

const keyUrl = `https://${TESLA_PARTNER_DOMAIN}/.well-known/appspecific/com.tesla.3p.public-key.pem`
const key = await fetch(keyUrl)
if (!key.ok) throw new Error(`Public key is not live at ${keyUrl} (${key.status})`)

const tok = await fetch(tokenUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: TESLA_CLIENT_ID,
    client_secret: TESLA_CLIENT_SECRET,
    scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds vehicle_location',
    audience: base,
  }),
})
if (!tok.ok) throw new Error(`Partner token failed: ${tok.status} ${await tok.text()}`)
const { access_token } = await tok.json()

const res = await fetch(`${base}/api/1/partner_accounts`, {
  method: 'POST',
  headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ domain: TESLA_PARTNER_DOMAIN }),
})
console.log(res.status, await res.text())
