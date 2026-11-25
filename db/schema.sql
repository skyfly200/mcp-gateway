-- MCP gateway schema. Safe to run more than once.

-- Tesla account link. One row: the owner's Tesla sign-in.
CREATE TABLE IF NOT EXISTS tesla_account (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refresh_token   text NOT NULL,          -- AES-256-GCM, see server/utils/crypto.ts
  access_token    text,                   -- AES-256-GCM
  access_expires  timestamptz,
  scopes          text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  vin           text PRIMARY KEY,
  display_name  text,
  model         text,
  firmware      text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per agent. Each agent has its own key and its own tool allowlist.
CREATE TABLE IF NOT EXISTS mcp_clients (
  id             serial PRIMARY KEY,
  name           text NOT NULL UNIQUE,
  token_hash     text NOT NULL UNIQUE,    -- sha256 hex of the bearer key
  allowed_tools  text[] NOT NULL DEFAULT ARRAY['*'],  -- globs for read tools, e.g. 'tesla_get_*'
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz
);
-- Tools that change the car (climate, charging, locks). Empty = none, for every agent by default.
ALTER TABLE mcp_clients ADD COLUMN IF NOT EXISTS allowed_commands text[] NOT NULL DEFAULT '{}';

-- Every tool call through the gateway, for any module.
CREATE TABLE IF NOT EXISTS command_log (
  id          bigserial PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  client_name text,
  tool        text NOT NULL,
  args        jsonb,
  ok          boolean NOT NULL,
  error       text,
  ms          integer
);
CREATE INDEX IF NOT EXISTS command_log_ts ON command_log (ts DESC);

-- Phase 4: other MCP servers the gateway passes through.
CREATE TABLE IF NOT EXISTS upstream_servers (
  id           serial PRIMARY KEY,
  module       text NOT NULL UNIQUE,      -- tool prefix, e.g. 'github'
  url          text NOT NULL,
  credentials  text,                      -- AES-256-GCM
  enabled      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Phase 3: telemetry. Created now so the shape is agreed early.
CREATE TABLE IF NOT EXISTS telemetry_raw (
  vin    text NOT NULL,
  ts     timestamptz NOT NULL,
  field  text NOT NULL,
  value  jsonb,
  PRIMARY KEY (vin, ts, field)
);

CREATE TABLE IF NOT EXISTS positions (
  vin       text NOT NULL,
  ts        timestamptz NOT NULL,
  lat       double precision,
  lon       double precision,
  speed     real,
  heading   real,
  odometer  double precision,
  soc       real,
  PRIMARY KEY (vin, ts)
);

CREATE TABLE IF NOT EXISTS trips (
  id           bigserial PRIMARY KEY,
  vin          text NOT NULL,
  started_at   timestamptz NOT NULL,
  ended_at     timestamptz,
  start_lat    double precision,
  start_lon    double precision,
  end_lat      double precision,
  end_lon      double precision,
  distance_mi  double precision,
  soc_used     real,
  max_speed    real
);

CREATE TABLE IF NOT EXISTS charging_sessions (
  id            bigserial PRIMARY KEY,
  vin           text NOT NULL,
  started_at    timestamptz NOT NULL,
  ended_at      timestamptz,
  lat           double precision,
  lon           double precision,
  soc_start     real,
  soc_end       real,
  energy_kwh    real,
  peak_kw       real
);
