import { safeEqual } from '../../../utils/crypto'
import { exchangeCode } from '../../../modules/tesla/client'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const expected = getCookie(event, 'tesla_oauth_state') ?? ''
  deleteCookie(event, 'tesla_oauth_state', { path: '/api/auth/tesla' })
  if (q.error) throw createError({ statusCode: 400, statusMessage: `Tesla sign-in failed: ${q.error}` })
  if (!expected || !safeEqual(String(q.state ?? ''), expected)) {
    throw createError({ statusCode: 400, statusMessage: 'Sign-in state did not match. Start again.' })
  }
  await exchangeCode(String(q.code ?? ''))
  return 'Tesla linked. You can close this page.'
})
