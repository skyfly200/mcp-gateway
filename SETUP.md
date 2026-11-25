# Setup log (manual steps)

Steps a person must do once for the gateway to work at all. Kept separate from [TESTING.md](TESTING.md).
Mark each step `[x]` when done.

## Phase 1: Vercel, Neon, Tesla sign-in, read tools

- [x] 1. Create the GitHub repo `skyfly200/mcp-gateway` (public; no keys in it).
- [ ] 2. Tesla account: verified email and multi-factor sign-in on.
- [ ] 3. Pick the partner domain. Plan: `tesla.skylerfly.com`. In Porkbun DNS, point it at Vercel (CNAME `cname.vercel-dns.com`, or what Vercel shows).
- [ ] 4. Make the Tesla key pair on your own machine. Keep `private-key.pem` off the repo and off Vercel.
  ```sh
  openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem
  openssl ec -in private-key.pem -pubout -out public-key.pem
  ```
- [ ] 5. Neon: create a free project. Copy its connection string. Then run `DATABASE_URL=... pnpm db:migrate`.
- [ ] 6. Vercel: import the repo, add the domain from step 3, and set these env vars (see `.env.example`):
  `DATABASE_URL`, `ENCRYPTION_KEY`, `ADMIN_SECRET`, `TESLA_PUBLIC_KEY` (text of `public-key.pem`), `TESLA_PARTNER_DOMAIN`, `TESLA_REDIRECT_URI`, `TESLA_API_BASE`.
- [ ] 7. Check `https://tesla.skylerfly.com/.well-known/appspecific/com.tesla.3p.public-key.pem` shows the public key.
- [ ] 8. developer.tesla.com: create the app (personal use). Scopes: openid, offline_access, user data, vehicle information, vehicle location, vehicle commands, vehicle charging management. Allowed origin: `https://tesla.skylerfly.com`. Redirect URI: `https://tesla.skylerfly.com/api/auth/tesla/callback`. You accept Tesla's terms here.
- [ ] 9. Add `TESLA_CLIENT_ID` and `TESLA_CLIENT_SECRET` to Vercel and redeploy.
- [ ] 10. Tesla billing: add a payment method and set a low billing limit (for example $10). The default limit is $0, which disables the app.
- [ ] 11. Register the domain with Tesla (once): `TESLA_CLIENT_ID=... TESLA_CLIENT_SECRET=... TESLA_PARTNER_DOMAIN=tesla.skylerfly.com pnpm tesla:register`. Expect status 200.
- [ ] 12. Sign in with Tesla: open `https://tesla.skylerfly.com/api/auth/tesla/login?key=<ADMIN_SECRET>` and approve every scope. The page should say "Tesla linked".
- [ ] 13. Make an agent key: `DATABASE_URL=... pnpm client:create <agent-name> 'tesla_*'`. Add the URL and key to the agent.

## Phase 2: commands (Fly proxy). Not built yet.

- [ ] Fly app with `tesla-http-proxy`, the private key as a Fly secret, and a TLS cert. About $2 to $4 a month.
- [ ] Pair the virtual key: open `https://tesla.com/_ak/tesla.skylerfly.com` on your phone, approve in the Tesla app, tap your key card in the car.

## Phase 3: telemetry. Not built yet.

- [ ] `telemetry.skylerfly.com` DNS to the Fly dedicated IPv4, plus its TLS cert.
- [ ] Car firmware 2024.26 or later.
