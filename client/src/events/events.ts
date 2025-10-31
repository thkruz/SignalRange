// Common event names (can be extended)

export enum Events {
  // Antenna events
  ANTENNA_CONFIG_CHANGED = 'antenna:config:changed',
  ANTENNA_LOOPBACK_CHANGED = 'antenna:loopback:changed',
  ANTENNA_HPA_CHANGED = 'antenna:hpa:changed',
  ANTENNA_TRACK_CHANGED = 'antenna:track:changed',
  ANTENNA_LOCKED = 'antenna:locked',
  ANTENNA_POWER_CHANGED = 'antenna:power:changed',
  ANTENNA_ERROR = 'antenna:error',

  // Transmitter events
  TX_CONFIG_CHANGED = 'tx:config:changed',
  TX_TRANSMIT_CHANGED = 'tx:transmit:changed',
  TX_ERROR = 'tx:error',

  // Receiver events
  RX_CONFIG_CHANGED = 'rx:config:changed',
  RX_SIGNAL_FOUND = 'rx:signal:found',
  RX_SIGNAL_LOST = 'rx:signal:lost',

  // Spectrum Analyzer events
  SPEC_A_CONFIG_CHANGED = 'specA:config:changed',
  SPEC_A_MODE_CHANGED = 'specA:mode:changed',

  // Router events
  ROUTE_CHANGED = 'route:changed',
}
