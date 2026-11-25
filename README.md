# mcp-gateway

One MCP server for all my agents. One address, one bearer key per agent, a per-agent tool allowlist, and a log of every call.

Modules:

- **tesla**: read and control my Tesla through Tesla Fleet API. Read tools work now. Climate and charging commands are built and wait for the signing proxy (phase 2).
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

## Commands (off for every agent until allowed)

Climate: `tesla_climate_on`, `tesla_climate_off`, `tesla_set_temperature` (F or C), `tesla_set_seat_heater`, `tesla_set_seat_cooler`, `tesla_set_steering_wheel_heater`, `tesla_set_defrost`, `tesla_set_climate_keeper` (off, keep, dog, camp).

Charging: `tesla_charge_start`, `tesla_charge_stop`, `tesla_set_charge_limit` (50 to 100), `tesla_set_charging_amps` (1 to 48), `tesla_charge_port_open`, `tesla_charge_port_close`.

Wake: `tesla_wake_vehicle` (costs one wake, 50 per $1).

Commands are signed by Tesla's `tesla-http-proxy` (set `TESLA_COMMAND_PROXY_URL`). They are never retried, because a command that times out may still have run. Commands cost 1,000 per $1.

Access rules per agent:

- `allowed_tools`: globs for read tools. Default `*`.
- `allowed_commands`: globs for anything that changes the car. Default empty, so no agent can send a command until you add it.

## Connect an agent

Endpoint: `https://<your-domain>/api/mcp` (streamable HTTP). Header: `Authorization: Bearer <agent key>`.

Make a key (shown once):

```sh
DATABASE_URL=... pnpm client:create research-bot 'tesla_get_*' tesla_list_vehicles
DATABASE_URL=... pnpm client:create muse '*' --commands 'tesla_climate_*' tesla_set_temperature
DATABASE_URL=... pnpm client:create home-agent '*' --commands 'tesla_*'
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
