import { z } from 'zod'
import type { GatewayModule, ToolDef } from '../../gateway/types'
import { fleet } from './client'

// Cost notes for agents (Tesla pricing, Nov 2026): data 500 calls per $1, wakes 50 per $1.
// Read tools here never wake the car.

const vin = { vin: z.string().min(11).describe('Vehicle VIN. Get it from tesla_list_vehicles.') }

type VehicleData = Record<string, Record<string, unknown> | unknown>

function pick(obj: Record<string, unknown> | undefined, keys: string[]) {
  if (!obj) return null
  return Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]))
}

/** Last reported state, without waking the car. Can be hours old. */
async function cached(v: string): Promise<VehicleData> {
  return fleet<VehicleData>(`/api/1/vehicles/${encodeURIComponent(v)}/vehicle_data_cached`)
}

const CHARGE_KEYS = [
  'battery_level', 'usable_battery_level', 'battery_range', 'est_battery_range', 'charging_state',
  'charge_limit_soc', 'charge_current_request', 'charge_current_request_max', 'charger_actual_current',
  'charger_power', 'charger_voltage', 'charge_rate', 'time_to_full_charge', 'charge_energy_added',
  'charge_port_door_open', 'conn_charge_cable', 'fast_charger_present', 'scheduled_charging_mode',
  'scheduled_charging_start_time', 'timestamp',
]
const CLIMATE_KEYS = [
  'is_climate_on', 'inside_temp', 'outside_temp', 'driver_temp_setting', 'passenger_temp_setting',
  'is_preconditioning', 'climate_keeper_mode', 'defrost_mode', 'seat_heater_left', 'seat_heater_right',
  'steering_wheel_heater', 'cabin_overheat_protection', 'is_auto_conditioning_on', 'timestamp',
]
const VEHICLE_KEYS = [
  'locked', 'odometer', 'car_version', 'sentry_mode', 'df', 'dr', 'pf', 'pr', 'ft', 'rt',
  'fd_window', 'fp_window', 'rd_window', 'rp_window', 'is_user_present', 'timestamp',
]

const tools: ToolDef[] = [
  {
    name: 'tesla_list_vehicles',
    title: 'List Tesla vehicles',
    description: 'List the vehicles on the linked Tesla account with VIN, name and online state. Does not wake any car.',
    risk: 'read',
    run: async () => {
      const list = await fleet<Record<string, unknown>[]>('/api/1/vehicles')
      return list.map(v => ({ vin: v.vin, name: v.display_name, state: v.state, id: v.id }))
    },
  },
  {
    name: 'tesla_get_status',
    title: 'Get vehicle status',
    description: 'Summary of the last reported state: charge, climate, locks and doors. Uses cached data and does not wake the car, so it can be hours old (see timestamp fields).',
    input: vin,
    risk: 'read',
    run: async ({ vin }) => {
      const d = await cached(vin as string)
      return {
        state: d.state,
        charge: pick(d.charge_state as Record<string, unknown>, CHARGE_KEYS),
        climate: pick(d.climate_state as Record<string, unknown>, CLIMATE_KEYS),
        vehicle: pick(d.vehicle_state as Record<string, unknown>, VEHICLE_KEYS),
      }
    },
  },
  {
    name: 'tesla_get_charge_state',
    title: 'Get charge state',
    description: 'Battery level, range, charging state, charge limit, amps and charge port. Cached data, does not wake the car.',
    input: vin,
    risk: 'read',
    run: async ({ vin }) => pick((await cached(vin as string)).charge_state as Record<string, unknown>, CHARGE_KEYS),
  },
  {
    name: 'tesla_get_climate_state',
    title: 'Get climate state',
    description: 'Cabin and outside temperature, climate on or off, set temperatures, seat and wheel heaters, climate keeper mode. Cached data, does not wake the car.',
    input: vin,
    risk: 'read',
    run: async ({ vin }) => pick((await cached(vin as string)).climate_state as Record<string, unknown>, CLIMATE_KEYS),
  },
  {
    name: 'tesla_get_location',
    title: 'Get vehicle location',
    description: 'Live GPS position, heading, speed and gear. Asks the car directly, so it fails if the car is asleep (it does not wake it). Each call is a billed data request.',
    input: vin,
    risk: 'read',
    run: async ({ vin }) => {
      const d = await fleet<VehicleData>(
        `/api/1/vehicles/${encodeURIComponent(vin as string)}/vehicle_data?endpoints=${encodeURIComponent('location_data;drive_state')}`,
      )
      return pick(d.drive_state as Record<string, unknown>, [
        'latitude', 'longitude', 'heading', 'speed', 'shift_state', 'power', 'timestamp',
      ])
    },
  },
]

export const teslaModule: GatewayModule = { id: 'tesla', tools: () => tools }
