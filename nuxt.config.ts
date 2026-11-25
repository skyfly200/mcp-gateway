// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  nitro: {
    preset: 'vercel',
    // Tesla reads the app public key from this exact path. A dot folder in
    // server/routes is easy to miss, so the route is registered here.
    handlers: [
      {
        route: '/.well-known/appspecific/com.tesla.3p.public-key.pem',
        method: 'get',
        handler: '~~/server/handlers/tesla-public-key.ts',
      },
    ],
  },
})
