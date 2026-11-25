# Testing log (merged, waiting for a manual test)

Features that are merged but not yet tested by hand. Written so a browser-driving AI can follow the steps.
Kept separate from [SETUP.md](SETUP.md). Remove an item once it passes.

Base URL below: `https://tesla.skylerfly.com` (change it if the domain differs).

## Phase 1 (merged Nov 25, 2026). Needs SETUP.md phase 1 done first.

1. **Health page.** Open `/api/health`. Expect `{"ok":true,"service":"mcp-gateway","modules":["tesla"]}`.
2. **Public key.** Open `/.well-known/appspecific/com.tesla.3p.public-key.pem`. Expect text that starts with `-----BEGIN PUBLIC KEY-----`.
3. **Sign-in is locked.** Open `/api/auth/tesla/login` with no key. Expect 403.
4. **Tesla sign-in.** Open `/api/auth/tesla/login?key=<ADMIN_SECRET>`. Sign in at Tesla and approve. Expect "Tesla linked. You can close this page."
5. **No key, no access.** `curl -i -X POST <base>/api/mcp -H 'content-type: application/json' -d '{}'`. Expect 401.
6. **Tool list.** In an agent with a `tesla_*` key, list tools. Expect the 5 `tesla_` tools.
7. **List vehicles.** Call `tesla_list_vehicles`. Expect your car's VIN and name.
8. **Charge state.** Call `tesla_get_charge_state` with the VIN. Expect battery level and charge limit that match the Tesla app (cached values can be hours old).
9. **Climate state.** Call `tesla_get_climate_state`. Expect inside and outside temperatures.
10. **Location.** With the car awake, call `tesla_get_location`. Expect latitude and longitude. With the car asleep, expect an error that says it is asleep, and the car stays asleep.
11. **Allowlist.** Make a key with only `tesla_list_vehicles`. List tools with it. Expect 1 tool.
12. **Call log.** In Neon, `SELECT * FROM command_log ORDER BY ts DESC LIMIT 10`. Expect one row per call above, with the agent name.
