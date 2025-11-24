import { Hertz, dB } from "@app/types";
import { RealTimeSpectrumAnalyzerState } from "./real-time-spectrum-analyzer";

export const defaultSpectrumAnalyzerState: Partial<RealTimeSpectrumAnalyzerState> = {
  isUseTapA: true,
  isUseTapB: true,
  isPaused: false,
  isMaxHold: false,
  isMinHold: false,
  isMarkerOn: false,
  isUpdateMarkers: false,
  topMarkers: [],
  markerIndex: 0,

  referenceLevel: 0, // dBm

  minFrequency: 5e3 as Hertz, // 5 kHz
  maxFrequency: 25.5e9 as Hertz, // 25.5 GHz
  centerFrequency: 600e6 as Hertz,
  span: 100e6 as Hertz,
  lastSpan: 100e6 as Hertz,
  rbw: 1e6 as Hertz,
  lockedControl: 'freq',
  hold: false,
  minAmplitude: -100,
  maxAmplitude: -40,
  scaleDbPerDiv: (-40 + 100) / 10 as dB, // 6 dB/div
  noiseFloorNoGain: -104,
  isSkipLnaGainDuringDraw: true,
  refreshRate: 10,
  screenMode: 'spectralDensity',
  inputUnit: 'MHz',
  inputValue: '',

  // Multi-trace support
  traces: [
    { isVisible: true, isUpdating: true, mode: 'clearwrite' }, // Trace 1
    { isVisible: true, isUpdating: true, mode: 'clearwrite' }, // Trace 2
    { isVisible: true, isUpdating: true, mode: 'clearwrite' }, // Trace 3
  ],
  selectedTrace: 1,
};
