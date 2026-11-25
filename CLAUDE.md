# mcp-gateway: notes for Claude

- Stack: Nuxt 4 (Nitro server routes) on Vercel, Neon over HTTP (`@neondatabase/serverless`), MCP SDK web-standard streamable HTTP transport, stateless.
- Run before every push: `pnpm typecheck && pnpm test && pnpm build`. Vercel builds from the repo; do not add GitHub Actions builds.
- Tool names carry the module prefix (`tesla_...`). New modules go in `server/modules/<name>/` and are listed in `server/gateway/registry.ts`.
- Tools that unlock, open or otherwise give access use `risk: 'sensitive'` (they then require `confirm: true`).
- Read tools must not wake the car. Prefer `vehicle_data_cached`.
- Never commit keys, tokens or `.pem` files. The Tesla private key lives only on the Fly proxy (phase 2).
- Keep two logs current: SETUP.md (manual setup needed for it to work at all) and TESTING.md (merged features waiting for a manual test).
