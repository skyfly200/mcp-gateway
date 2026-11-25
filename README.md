# mcp-gateway

One MCP server for all my agents. One address, one bearer key per agent, a per-agent tool allowlist, and a log of every call.

Modules:

- **tesla**: read and control my Tesla through Tesla Fleet API. Phase 1 has read tools only.
- Later: pass-through to other remote MCP servers, served under their own prefix.

Runs on Vercel (Nuxt / Nitro). Data in Neon. Tesla command signing and streaming telemetry need a small Fly.io machine (phases 2 and 3). See [PLAN.md](PLAN.md).

## Tools (phase 1)

| Tool | What it does | Tesla cost |
| --- | --- | --- |
| `tesla_list_vehicles` | VIN, name, online state | 1 data call |
| `tesla_get_status` | Charge, climate, locks, doors (cached, no wake) | 1 data call |
| `tesla_get_charge_state` | Battery, range, limit, amps, port (cached, no wake) | 1 data call |
| `tesla_get_climate_state` | Temps, climate on/off, heaters, keeper mode (cached, no wake) | 1 data call |
| `tesla_get_location` | Live GPS, speed, gear. Fails if the car is asleep | 1 data call |

Tesla bills data at 500 calls per $1, with a $10 monthly discount per account.

## Connect an agent

Endpoint: `https://<your-domain>/api/mcp` (streamable HTTP). Header: `Authorization: Bearer <agent key>`.

Make a key (shown once):

```sh
DATABASE_URL=... pnpm client:create muse 'tesla_*'
DATABASE_URL=... pnpm client:create research-bot 'tesla_get_*' tesla_list_vehicles
```

Claude Code:

```sh
claude mcp add --transport http gateway https://<your-domain>/api/mcp --header "Authorization: Bearer <agent key>"
```

Claude API agents: pass the same URL and key as an MCP server (`url`, `authorization_token`).

## Develop

```sh
pnpm install
cp .env.example .env   # fill in
pnpm dev
pnpm typecheck && pnpm test && pnpm build
```

- [SETUP.md](SETUP.md): one-time setup steps that must be done by hand.
- [TESTING.md](TESTING.md): merged features that still need a manual test.
