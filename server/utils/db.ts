import { neon } from '@neondatabase/serverless'

let client: ReturnType<typeof neon> | undefined

/** Tagged-template SQL against Neon over HTTP. Works in Vercel functions. */
export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    client = neon(url)
  }
  return client
}
