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
6. **Tool list.** In an agent with a read-only key (`'*'`, no commands), list tools. Expect only the 5 read tools, and no command tools.
7. **List vehicles.** Call `tesla_list_vehicles`. Expect your car's VIN and name.
8. **Charge state.** Call `tesla_get_charge_state` with the VIN. Expect battery level and charge limit that match the Tesla app (cached values can be hours old).
9. **Climate state.** Call `tesla_get_climate_state`. Expect inside and outside temperatures.
10. **Location.** With the car awake, call `tesla_get_location`. Expect latitude and longitude. With the car asleep, expect an error that says it is asleep, and the car stays asleep.
11. **Allowlist.** Make a key with only `tesla_list_vehicles`. List tools with it. Expect 1 tool.
12. **Call log.** In Neon, `SELECT * FROM command_log ORDER BY ts DESC LIMIT 10`. Expect one row per call above, with the agent name.

## Phase 2 commands (merged Nov 25, 2026). Needs SETUP.md phase 2 done first.

Use an agent key with commands allowed. Each step: check the result in the Tesla app.

1. **Commands are off by default.** With a read-only key, call `tesla_climate_on`. Expect an error (tool not found), and nothing changes on the car.
2. **Asleep car.** With the car asleep, call `tesla_climate_on`. Expect an error that says to wake it, and the car stays asleep.
3. **Wake.** Call `tesla_wake_vehicle`, wait 30 seconds, then `tesla_list_vehicles`. Expect state `online`.
4. **Climate on and off.** Call `tesla_climate_on`. Expect climate on in the Tesla app. Then `tesla_climate_off`.
5. **Temperature.** Call `tesla_set_temperature` with driver 70 (F). Expect 70 F (21 C) in the app.
6. **Seat heater.** With climate on, call `tesla_set_seat_heater` with seat `front_left`, level 3. Expect the driver seat on high.
7. **Seat cooler (ventilated seats only).** With climate on, call `tesla_set_seat_cooler` with `front_left`, level 1. Expect low cooling, not off. If it is one level off, the level mapping in `command-tools.ts` needs a fix.
8. **Wheel heater.** `tesla_set_steering_wheel_heater` with on true. Expect it on.
9. **Defrost.** `tesla_set_defrost` on true, then on false.
10. **Climate keeper.** `tesla_set_climate_keeper` with `dog`. Expect Dog Mode. Then `off`.
11. **Charge limit.** `tesla_set_charge_limit` 80. Expect 80% in the app. Then set it back.
12. **Charging amps.** While plugged in, `tesla_set_charging_amps` 16. Expect 16 A.
13. **Start and stop.** While plugged in, `tesla_charge_stop`, then `tesla_charge_start`.
14. **Charge port.** In Park and unplugged, `tesla_charge_port_open`, then `tesla_charge_port_close`.
15. **Refusal.** Unplugged, call `tesla_charge_start`. Expect an error with the car's reason.
16. **Call log.** In Neon, check `command_log` has one row per command, with `ok` false for the refused ones.
