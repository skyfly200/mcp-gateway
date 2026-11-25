/** Serves the Tesla app public key at /.well-known/appspecific/com.tesla.3p.public-key.pem */
export default defineEventHandler((event) => {
  const pem = process.env.TESLA_PUBLIC_KEY?.replace(/\\n/g, '\n').trim()
  if (!pem || !pem.includes('BEGIN PUBLIC KEY')) {
    throw createError({ statusCode: 404, statusMessage: 'Public key not configured' })
  }
  setHeader(event, 'content-type', 'application/x-pem-file')
  setHeader(event, 'cache-control', 'public, max-age=300')
  return pem + '\n'
})
