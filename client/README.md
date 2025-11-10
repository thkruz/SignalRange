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

## 🏗️ Architecture

### Tech Stack

- **TypeScript** - Type-safe code throughout
- **Webpack** - Module bundling and development server
- **Canvas API** - Spectrum analyzer visualization

## 📄 License

AGPLv3 - See LICENSE.md
