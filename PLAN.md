# MCP gateway (Tesla first): plan

Repo: `skyfly200/mcp-gateway` (renamed from tesla-mcp, Skyler, Nov 25).

Status: plan only. Nothing is created or deployed. Researched Nov 25, 2026 from developer.tesla.com, the teslamotors GitHub repos and Vercel docs.

## Result

- It works, with one change: Vercel cannot do it alone.
- Tesla rejects unsigned commands on most cars. Signing needs Tesla's Go proxy (`tesla-http-proxy`), a long-running TLS server.
- Streaming telemetry needs Tesla's `fleet-telemetry` server. The car opens an mTLS WebSocket to it. It must be always on and public.
- Both go on one small Fly.io machine. Vercel holds the MCP server, the Tesla login, the public key and the daily stats job. Neon holds tokens, telemetry and logs.

## Costs (monthly, estimates)

| Part | Cost |
| --- | --- |
| Vercel Hobby (personal, non-commercial) | $0 |
| Neon free tier | $0 |
| Tesla Fleet API usage | about $2 to $4, covered by Tesla's $10 monthly discount, so $0 |
| Fly.io: 1 shared-cpu machine, 256 MB, always on | about $2 (Fly's usual rate, not checked today) |
| Fly.io: dedicated IPv4 (mTLS must pass through Fly's proxy untouched) | about $2 (same caveat) |
| Domain: subdomains of skylerfly.com at Porkbun | $0 |
| **Total** | **about $4** |

Tesla rates (developer.tesla.com pricing): data 500 requests per $1, commands 1,000 per $1, wakes 50 per $1, streaming 150,000 signals per $1. Tesla needs a payment method on file and a billing limit above $0, or the app is disabled.

Why streaming and not polling: polling `vehicle_data` every 5 minutes is about 8,640 calls, about $17 a month. Streaming about 15 signals a minute while driving is about $0.006 an hour, so 30 hours of driving is about $0.20. Streaming is also the only way to get real trip paths.

Wakes are the expensive call (2 cents each). Read tools use `vehicle_data_cached` (new Nov 11, 2026), which does not wake the car. A tool wakes the car only when a command needs it.

## Architecture

```
AI agents --(MCP over streamable HTTP, bearer token)--> Vercel: Nuxt app
   Vercel:  /api/mcp           MCP tools
            /api/auth/tesla/*  Tesla OAuth login and callback
            /.well-known/appspecific/com.tesla.3p.public-key.pem
            daily cron         roll raw telemetry into trips and charge sessions
   Vercel --(signed command REST)--> Fly: tesla-http-proxy --> Tesla Fleet API --> car
   car --(mTLS WebSocket)--> Fly: fleet-telemetry --> small writer --> Neon
   Vercel <--> Neon (tokens, telemetry, trips, command log)
```

- Stack: Nuxt (Nitro server routes) on Vercel, Vite build, Vercel builds from the repo. No GitHub Actions.
- MCP endpoint auth, phase 1: one long random bearer token per agent, stored hashed in Neon, so you can revoke one agent. Phase 2 (optional): MCP OAuth, so claude.ai and mobile connectors can sign in.
- Tesla tokens: refresh token encrypted at rest in Neon. Only the Vercel app reads it.
- Proxy on Fly: accepts calls only from Vercel (shared secret header plus TLS). The Tesla private key lives only as a Fly secret.
- fleet-telemetry does not write to Postgres. A small writer on the same machine takes its output and inserts into Neon.
- Vercel Hobby cron runs once a day at most (timing within the hour). That suits the daily rollup only. All live data comes from the stream.

## Gateway shape (one address, one key per agent)

- One MCP endpoint on Vercel: `/api/mcp`. Every agent uses the same URL with its own bearer key.
- Modules live in `modules/<name>/`. Tesla is the first module. Its tools are named `tesla_*`.
- Later modules are pass-through hubs: the gateway acts as an MCP client to another remote MCP server (streamable HTTP), lists its tools, and serves them again with a prefix (for example `github_create_issue`). Upstream keys are stored encrypted in Neon, never given to agents.
- Each agent key has an allowlist of modules and tools. Example: a research agent gets read tools only, not `tesla_unlock`.
- Upstream servers that run only over stdio cannot run on Vercel. Those go on the Fly machine if you ever need one.
- Every call through the gateway writes to `command_log`, for any module.

## Tesla module tools (build order)

1. Read (no wake): `list_vehicles`, `get_status`, `get_charge_state`, `get_climate_state`, `get_location`.
2. Climate (top need): `climate_on`, `climate_off`, `set_temperature`, `set_seat_heater`, `set_seat_cooler`, `set_steering_wheel_heater`, `set_climate_keeper` (off, keep, dog, camp). Seat heat and cool need climate on first.
3. Charging: `charge_start`, `charge_stop`, `set_charge_limit`, `set_charging_amps`, `charge_port_open`, `charge_port_close`, `add_charge_schedule`, `remove_charge_schedule`.
4. Access: `lock`, `unlock`, `open_trunk` (front or rear). These need a `confirm: true` argument and are rate limited.
5. Stats (Neon only, no Tesla cost): `get_trips`, `get_charging_sessions`, `get_usage_summary`.
6. `wake_vehicle`, explicit, so an agent sees that it costs a wake.

Every command writes a row to `command_log`: time, agent, tool, arguments, result.

## Neon schema (first draft)

- `tesla_account`: encrypted refresh token, scopes, expiry.
- `vehicles`: vin, name, model, firmware.
- `mcp_clients`: agent name, token hash, allowed modules and tools, created, revoked.
- `upstream_servers`: module name, URL, encrypted credentials, enabled.
- `telemetry_raw`: vin, ts, field, value (jsonb). Pruned after rollup to stay inside the free tier.
- `positions`: vin, ts, lat, lon, speed, heading, odometer, soc.
- `trips`: vin, start and end ts, start and end place, distance (odometer delta), soc used, max speed.
- `charging_sessions`: vin, start and end ts, place, soc start and end, energy added, peak kW.
- `command_log`: as above.

## Phases

1. Vercel app, public key, Tesla login, token storage, read tools. Testable before any Fly cost.
2. Fly machine with the proxy. Then climate, then charging, then lock and trunk.
3. fleet-telemetry on the same Fly machine, writer to Neon, daily rollup, stats tools.
4. Pass-through hub for other remote MCP servers, with per-agent allowlists.
   - First upstream: the AI harness's own MCP servers, starting with its app launcher at `https://ai.skylerfly.com/mcp/launcher`. Plan: `docs/launcher-plan.md` in skyfly200/custom-ai-harness.
   - Auth: one harness MCP key (works only under `/mcp/`, cannot call models), stored encrypted in `upstream_servers`. Tools are served again as `harness_*`. Create tools go in `allowed_commands` with `risk: 'sensitive'`.
   - The gateway holds no launcher keys or cloud tokens. Those stay in the harness.
   - The key that the harness assistant uses here gets no `harness_*` tools, so calls cannot loop.
   - The harness Machine sleeps when idle. Wait up to 30 s for it, then tell the agent to try again in one minute.

## Risks and open points

- Tesla may not accept a `*.vercel.app` domain as the partner domain. Plan uses a skylerfly.com subdomain to avoid that.
- Streaming needs car firmware 2024.26 or later (Tesla docs).
- If the car is a pre-2021 Model S or X, commands do not need the proxy, but streaming has other firmware limits.
- A command that times out can still run on the car. The server will not retry commands on its own.
- A JS signing library exists (eiannone/tesla-cmd-api) but it is a 1-commit draft. Plan uses Tesla's own Go proxy.

## Setup log (manual steps, yours)

Kept separate from the testing log. In the repo these become SETUP.md and TESTING.md.

1. Create an empty private GitHub repo `skyfly200/mcp-gateway`. This session cannot create repos.
2. Tesla account: verified email and MFA on.
3. developer.tesla.com: create the app (personal). Scopes: openid, offline_access, vehicle_device_data, vehicle_location, vehicle_cmds, vehicle_charging_cmds. Allowed origin and redirect URI come from step 6. You accept Tesla's terms here.
4. Tesla billing: add a payment method and set a low billing limit (for example $10).
5. Make the key pair on your own machine: `openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem`, then `openssl ec -in private-key.pem -pubout -out public-key.pem`. The public key goes in the repo. The private key goes only to Fly secrets.
6. Porkbun DNS: `tesla.skylerfly.com` to Vercel, `telemetry.skylerfly.com` to the Fly dedicated IPv4.
7. Vercel: import the repo, add env vars (Tesla client ID and secret, Neon URL, encryption key, proxy secret).
8. Neon: a new free project (I can create it on your yes).
9. Fly: a new app, the dedicated IPv4, the private key as a secret, a TLS cert for telemetry.skylerfly.com.
10. Run Tesla's partner register call once (I can do it on your yes, after steps 3 to 6).
11. Sign in with Tesla once on the app's login page and approve the scopes.
12. Pair the virtual key: open `https://tesla.com/_ak/tesla.skylerfly.com` on your phone, approve in the Tesla app, tap your key card in the car.
13. Check car firmware is 2024.26 or later for streaming.
14. Add the MCP URL and a token to each agent.

## Testing log (merged features waiting for a manual test)

Empty. Each merged feature gets a line here with steps a browser-driving AI can follow.
