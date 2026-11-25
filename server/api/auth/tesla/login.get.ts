import { randomBytes } from 'node:crypto'
import { safeEqual } from '../../../utils/crypto'
import { TESLA_AUTHORIZE_URL, TESLA_SCOPES } from '../../../modules/tesla/client'

/** Starts the Tesla sign-in. Only the owner can start it: /api/auth/tesla/login?key=<ADMIN_SECRET> */
export default defineEventHandler((event) => {
  const key = String(getQuery(event).key ?? '')
  const admin = process.env.ADMIN_SECRET ?? ''
  if (!admin || !safeEqual(key, admin)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  const state = randomBytes(24).toString('hex')
  setCookie(event, 'tesla_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/api/auth/tesla',
  })
  const url = new URL(TESLA_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TESLA_CLIENT_ID ?? '',
    redirect_uri: process.env.TESLA_REDIRECT_URI ?? '',
    scope: TESLA_SCOPES,
    state,
    prompt_missing_scopes: 'true',
  }).toString()
  return sendRedirect(event, url.toString())
})
