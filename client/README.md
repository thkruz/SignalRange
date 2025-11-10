# SignalRange | Space Electronic Warfare Lab

A comprehensive training environment for Space Electronic Warfare, rewritten in TypeScript with vanilla JavaScript (no React).

## 🚀 Project Overview

SignalRange is a web-based simulation for learning Space Electronic Warfare operations. It provides:

- **Antenna** - C-band antenna system
- **OMT/Duplexer** - Manages transmit and receive paths
- **BPF** - Bandpass Filters for frequency selection
- **LNA** - Low Noise Amplifier for weak signal reception
- **Mixer** - Frequency conversion
- **IF Filter Bank** - Intermediate frequency filtering
- **GPS Disciplined Oscillator** - Stable frequency reference
- **Block Upconverter** - Upconverts IF to RF for transmission
- **High Power Amplifier** - Amplifies RF signals for transmission
- **Spectrum Analyzers** - Visualize RF signals in real-time
- **Transmitter Cases** (8 modems) - Generate jamming signals
- **Receiver Cases** (8 modems) - Receive and decode satellite transmissions

## 🛠️ Getting Started

Instructions are still WIP.

The current (11/10/2025) scenario is a C-Band satellite with a 5935 MHz uplink and a 3710 MHz downlink. To see the downlink you need to:

### RX Setup

- Enable auto-track to track the satellite.
- Set your receiver to 490 MHz IF, 10 MHz BW, 8QAM demodulation, and 3/4 FEC.
- Duplexer needs to RX with Horizontal (H) polarization OR the Antenna needs to be skewed to 90 degrees effectively reversing the polarization.
- LNB LO should be left at 4200 MHz and reduce the gain to 31 dB.
- Change the IF Filter Bank to use a 10 MHz filter.
- Ensure the Spec-A is set to 490 MHz center frequency with at least 10 MHz span to see the downlink signal on the RX IF Tap point.

### TX Setup

- Set your transmitter to 1735 MHz IF, 3 MHz BW, annd 3 dBm output power.
- Enable the transmitter and ensure there are no faults or loopback.
- In the BUC ensure the gain is at least 30 dB and leave the LO at 4200 MHz.
- Open the safety switch in the HPA and enable it (down) to transmit.
- This will send a 1735 MHz IF signal to the BUC which will upconvert it to 5935 MHz for uplink to the satellite. It will mix in with the real satellite uplink signal and cause it to send a degraded signal down to the receiver.

### 🐞 Known Issues

- This is meant for desktops. The layout will not be great on mobile devices.
- I develop on Chromium-based browsers, so Firefox or Safari may have issues.
- Not every pathway has perfect logic right now. Using loopback won't be 100% accurate.
- I am focusing on functionality over accuracy right now. Some values and behaviors may not be realistic.

NOTE: The spectrum analyzer uses a lot of random numbers and gaussian noise to simulate signals. It will become more accurate once the signal flow is fully implemented.

## 🏗️ Architecture

### Tech Stack

- **TypeScript** - Type-safe code throughout
- **Webpack** - Module bundling and development server
- **Canvas API** - Spectrum analyzer visualization

## 📄 License

AGPLv3 - See LICENSE.md
