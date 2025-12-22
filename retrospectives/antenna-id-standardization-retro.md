# Antenna ID Standardization Retrospective

## Summary
Standardized antenna references in equipment modems from `antennaUuid: string` (receiver) to `antenna_id: number` (matching transmitter pattern).

## What worked

- Clear plan with specific line numbers made implementation straightforward
- TypeScript compiler caught all the places that needed updating
- The numeric ID pattern is simpler and works well with scenario config files

## What didn't

- Initially planned to use UUID pattern, but user feedback revealed that UUIDs are generated at runtime making them unusable in config files
- Had to update receiver-adapter.ts which wasn't in the original plan
- The `antennas` constructor parameter became unused after removing UUID fallback logic, requiring a getter to satisfy TypeScript's strict unused variable checks

## What to change next time

- When planning interface changes, check both the core class AND its adapter for usages
- Consider config file authoring experience when choosing ID patterns (runtime-generated IDs don't work in static configs)
- When simplifying code that removes usage of a parameter, check if the parameter is still needed for API compatibility

## Files changed

- `src/equipment/receiver/receiver.ts` - Interface, constructor, DOM, handlers
- `src/pages/mission-control/tabs/receiver-adapter.ts` - Handler and sync methods
- `src/campaigns/nats/scenario1.ts` - Receiver modem config
