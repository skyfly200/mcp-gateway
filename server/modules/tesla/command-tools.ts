import { z } from 'zod'
import type { ToolDef } from '../../gateway/types'
import { sendCommand, wake } from './commands'

// Commands change the car. Every agent is denied them until its allowed_commands list matches.
// Tesla bills commands at 1,000 per $1. Parameter names follow teslamotors/vehicle-command pkg/proxy.

const vin = z.string().length(17).describe('17-character VIN. Get it from tesla_list_vehicles.')
const asleep = ' The car must be awake; if it is asleep, the call fails and tells you to use tesla_wake_vehicle.'

// Proxy seat_position index for seat heaters (pkg/proxy seatPositions order).
const HEATER_SEATS = { front_left: 0, front_right: 1, rear_left: 2, rear_center: 4, rear_right: 5 } as const
// HvacSeatCoolerPosition enum: FrontLeft = 1, FrontRight = 2.
const COOLER_SEATS = { front_left: 1, front_right: 2 } as const
const KEEPER_MODES = { off: 0, keep: 1, dog: 2, camp: 3 } as const

export function toCelsius(value: number, unit: 'F' | 'C'): number {
  const c = unit === 'F' ? (value - 32) * 5 / 9 : value
  return Math.round(c * 2) / 2
}

function command(def: Omit<ToolDef, 'risk'>): ToolDef {
  return { risk: 'command', ...def }
}

export const climateTools: ToolDef[] = [
  command({
    name: 'tesla_climate_on',
    title: 'Turn climate on',
    description: 'Start climate control (preconditioning) with the current settings.' + asleep,
    input: { vin },
    run: async a => sendCommand(a.vin as string, 'auto_conditioning_start'),
  }),
  command({
    name: 'tesla_climate_off',
    title: 'Turn climate off',
    description: 'Stop climate control.' + asleep,
    input: { vin },
    run: async a => sendCommand(a.vin as string, 'auto_conditioning_stop'),
  }),
  command({
    name: 'tesla_set_temperature',
    title: 'Set cabin temperature',
    description: 'Set the driver and passenger temperature. Default unit is Fahrenheit. Range about 59 to 82 F (15 to 28 C). Does not turn climate on.' + asleep,
    input: {
      vin,
      driver: z.number().describe('Driver side temperature'),
      passenger: z.number().optional().describe('Passenger side temperature. Defaults to the driver value.'),
      unit: z.enum(['F', 'C']).default('F'),
    },
    run: async (a) => {
      const unit = (a.unit as 'F' | 'C') ?? 'F'
      const driver = toCelsius(a.driver as number, unit)
      const passenger = toCelsius((a.passenger as number | undefined) ?? (a.driver as number), unit)
      for (const t of [driver, passenger]) {
        if (t < 15 || t > 28) throw new Error(`Temperature ${t} C is outside 15 to 28 C`)
      }
      return sendCommand(a.vin as string, 'set_temps', { driver_temp: driver, passenger_temp: passenger })
    },
  }),
  command({
    name: 'tesla_set_seat_heater',
    title: 'Set seat heater',
    description: 'Set one seat heater: 0 off, 1 low, 2 medium, 3 high. Climate must be on first.' + asleep,
    input: {
      vin,
      seat: z.enum(Object.keys(HEATER_SEATS) as [keyof typeof HEATER_SEATS]),
      level: z.number().int().min(0).max(3),
    },
    run: async a => sendCommand(a.vin as string, 'remote_seat_heater_request', {
      seat_position: HEATER_SEATS[a.seat as keyof typeof HEATER_SEATS],
      level: a.level,
    }),
  }),
  command({
    name: 'tesla_set_seat_cooler',
    title: 'Set seat cooler',
    description: 'Set a front seat cooler (ventilated seats only): 0 off, 1 low, 2 medium, 3 high. Climate must be on first.' + asleep,
    input: {
      vin,
      seat: z.enum(Object.keys(COOLER_SEATS) as [keyof typeof COOLER_SEATS]),
      level: z.number().int().min(0).max(3),
    },
    // The proxy subtracts 1 (API levels are 1 off to 4 high), so send level + 1.
    run: async a => sendCommand(a.vin as string, 'remote_seat_cooler_request', {
      seat_position: COOLER_SEATS[a.seat as keyof typeof COOLER_SEATS],
      seat_cooler_level: (a.level as number) + 1,
    }),
  }),
  command({
    name: 'tesla_set_steering_wheel_heater',
    title: 'Steering wheel heater',
    description: 'Turn the steering wheel heater on or off. Climate must be on first.' + asleep,
    input: { vin, on: z.boolean() },
    run: async a => sendCommand(a.vin as string, 'remote_steering_wheel_heater_request', { on: a.on }),
  }),
  command({
    name: 'tesla_set_defrost',
    title: 'Max defrost',
    description: 'Turn max defrost (max preconditioning) on or off.' + asleep,
    input: { vin, on: z.boolean() },
    run: async a => sendCommand(a.vin as string, 'set_preconditioning_max', { on: a.on }),
  }),
  command({
    name: 'tesla_set_climate_keeper',
    title: 'Climate keeper mode',
    description: 'Keep climate running while parked: off, keep, dog or camp.' + asleep,
    input: { vin, mode: z.enum(['off', 'keep', 'dog', 'camp']) },
    run: async a => sendCommand(a.vin as string, 'set_climate_keeper_mode', {
      climate_keeper_mode: KEEPER_MODES[a.mode as keyof typeof KEEPER_MODES],
    }),
  }),
]

export const chargingTools: ToolDef[] = [
  command({
    name: 'tesla_charge_start',
    title: 'Start charging',
    description: 'Start charging. The cable must be plugged in.' + asleep,
    input: { vin },
    run: async a => sendCommand(a.vin as string, 'charge_start'),
  }),
  command({
    name: 'tesla_charge_stop',
    title: 'Stop charging',
    description: 'Stop charging.' + asleep,
    input: { vin },
    run: async a => sendCommand(a.vin as string, 'charge_stop'),
  }),
  command({
    name: 'tesla_set_charge_limit',
    title: 'Set charge limit',
    description: 'Set the charge limit in percent, 50 to 100.' + asleep,
    input: { vin, percent: z.number().int().min(50).max(100) },
    run: async a => sendCommand(a.vin as string, 'set_charge_limit', { percent: a.percent }),
  }),
  command({
    name: 'tesla_set_charging_amps',
    title: 'Set charging amps',
    description: 'Set the charging current in amps, 1 to 48. The car caps it at what the charger allows.' + asleep,
    input: { vin, amps: z.number().int().min(1).max(48) },
    run: async a => sendCommand(a.vin as string, 'set_charging_amps', { charging_amps: a.amps }),
  }),
  command({
    name: 'tesla_charge_port_open',
    title: 'Open charge port',
    description: 'Open the charge port door. The car must be in Park.' + asleep,
    input: { vin },
    run: async a => sendCommand(a.vin as string, 'charge_port_door_open'),
  }),
  command({
    name: 'tesla_charge_port_close',
    title: 'Close charge port',
    description: 'Close the charge port door.' + asleep,
    input: { vin },
    run: async a => sendCommand(a.vin as string, 'charge_port_door_close'),
  }),
]

export const wakeTool: ToolDef = command({
  name: 'tesla_wake_vehicle',
  title: 'Wake the car',
  description: 'Wake the car so it can take commands. Costs one wake (Tesla bills 50 wakes per $1, max 3 a minute). Only call this when a command needs it.',
  input: { vin },
  run: async a => wake(a.vin as string),
})
