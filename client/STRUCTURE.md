# IRIS TypeScript Project Structure

## Complete Directory Tree

```
iris-ts/
│
├── public/                          # Static assets (copied to dist during build)
│   ├── index.html                   # Main HTML template
│   ├── favicon.ico                  # Favicon
│   ├── patch.png                    # IRIS logo/patch
│   ├── bezel.png                    # Equipment bezel image
│   ├── baseball_switch.png          # Switch graphics
│   ├── baseball_switch2.png
│   ├── nasalization-rg.otf          # NASA font
│   ├── videos/                      # Video feeds for receivers
│   │   ├── feed1.mp4
│   │   ├── degraded feed1.mp4
│   │   └── ...
│   └── data/                        # Mock data for GitHub Pages
│       ├── server.json
│       ├── spec_a.json
│       └── ...
│
├── src/                             # TypeScript source code
│   │
│   ├── index.ts                     # Application entry point
│   ├── App.ts                       # Main application orchestrator
│   │
│   ├── components/                  # UI Components
│   │   ├── Component.ts             # Base component class
│   │   │
│   │   ├── layout/                  # Layout components
│   │   │   ├── Header.ts
│   │   │   ├── Header.css
│   │   │   ├── Body.ts
│   │   │   ├── Body.css
│   │   │   ├── Footer.ts
│   │   │   └── Footer.css
│   │   │
│   │   ├── equipment/               # Equipment components
│   │   │   │
│   │   │   ├── SpectrumAnalyzer/
│   │   │   │   ├── SpectrumAnalyzer.ts          # Canvas-based analyzer
│   │   │   │   ├── SpectrumAnalyzerBox.ts       # Analyzer container
│   │   │   │   ├── SpectrumAnalyzerGrid.ts      # 4-analyzer grid
│   │   │   │   ├── AnalyzerControl.ts           # Config modal
│   │   │   │   └── SpectrumAnalyzer.css
│   │   │   │
│   │   │   ├── Antenna/
│   │   │   │   ├── AntennaCase.ts               # Antenna container
│   │   │   │   ├── AntennaCases.ts              # Multiple antennas
│   │   │   │   ├── AntennaController.ts         # Antenna controls
│   │   │   │   ├── AntennaInput.ts              # Input fields
│   │   │   │   ├── LoopbackSwitch.ts            # Loopback switch
│   │   │   │   └── Antenna.css
│   │   │   │
│   │   │   ├── Transmitter/
│   │   │   │   ├── TxCase.ts                    # TX case container
│   │   │   │   ├── TxCases.ts                   # Multiple TX cases
│   │   │   │   ├── TxModem.ts                   # Individual modem
│   │   │   │   ├── TxModemButton.ts             # Modem selector button
│   │   │   │   ├── TxModemButtonBox.ts          # Button container
│   │   │   │   ├── TxModemInput.ts              # Modem controls
│   │   │   │   └── Transmitter.css
│   │   │   │
│   │   │   ├── Receiver/
│   │   │   │   ├── RxCase.ts                    # RX case container
│   │   │   │   ├── RxCases.ts                   # Multiple RX cases
│   │   │   │   ├── RxModem.ts                   # Individual modem
│   │   │   │   ├── RxModemButton.ts             # Modem selector button
│   │   │   │   ├── RxModemButtonBox.ts          # Button container
│   │   │   │   ├── RxModemInput.ts              # Modem controls
│   │   │   │   ├── RxVideo.ts                   # Video display
│   │   │   │   └── Receiver.css
│   │   │   │
│   │   │   └── EquipmentCase.ts                 # Base equipment case
│   │   │
│   │   ├── common/                  # Shared/common components
│   │   │   ├── Button.ts
│   │   │   ├── PhysicalButton.ts                # 3D button effect
│   │   │   ├── Modal.ts
│   │   │   ├── ProgressBar.ts
│   │   │   ├── Select.ts
│   │   │   ├── Input.ts
│   │   │   └── common.css
│   │   │
│   │   ├── help/                    # Help modals
│   │   │   ├── SpecAHelp.ts
│   │   │   ├── AntennaHelp.ts
│   │   │   ├── TxCaseHelp.ts
│   │   │   ├── RxCaseHelp.ts
│   │   │   └── InstructionsIcon.ts
│   │   │
│   │   └── login/                   # Login components
│   │       ├── TeamSelect.ts
│   │       ├── ServerSelect.ts
│   │       └── JoinButton.ts
│   │
│   ├── models/                      # Data models and business logic
│   │   ├── AppState.ts              # Global state manager (Singleton)
│   │   ├── RfEnvironment.ts         # RF signal environment
│   │   ├── SpectrumAnalyzer.ts      # Spectrum analyzer logic
│   │   ├── User.ts                  # User model
│   │   ├── Antenna.ts               # Antenna model
│   │   ├── Transmitter.ts           # Transmitter model
│   │   ├── Receiver.ts              # Receiver model
│   │   └── Signal.ts                # Signal model
│   │
│   ├── pages/                       # Page-level components
│   │   ├── LoginPage.ts             # Login/team selection
│   │   ├── StudentPage.ts           # Student interface
│   │   └── InstructorPage.ts        # Instructor interface
│   │
│   ├── services/                    # Business services
│   │   ├── Router.ts                # Client-side routing
│   │   ├── SocketService.ts         # WebSocket communication
│   │   ├── ApiService.ts            # REST API calls
│   │   ├── AudioService.ts          # Sound effects
│   │   └── DataService.ts           # Data fetching/caching
│   │
│   ├── utils/                       # Utility functions
│   │   ├── dom.ts                   # DOM manipulation helpers
│   │   ├── math.ts                  # Mathematical utilities
│   │   ├── validation.ts            # Input validation
│   │   ├── formatting.ts            # Number/string formatting
│   │   └── github-check.ts          # GitHub Pages detection
│   │
│   ├── constants/                   # Application constants
│   │   ├── index.ts                 # Main constants export
│   │   ├── satellites.ts            # Satellite data
│   │   ├── antennas.ts              # Antenna configurations
│   │   ├── teams.ts                 # Team definitions
│   │   └── defaults.ts              # Default values
│   │
│   ├── types/                       # TypeScript type definitions
│   │   ├── index.ts                 # Main types export
│   │   ├── equipment.ts             # Equipment types
│   │   ├── signal.ts                # Signal types
│   │   └── api.ts                   # API response types
│   │
│   ├── styles/                      # Global styles
│   │   ├── index.css                # Main stylesheet
│   │   ├── variables.css            # CSS variables
│   │   ├── buttons.css              # Button styles
│   │   ├── 3d-buttons.css           # 3D button effects
│   │   └── theme.css                # Theme colors
│   │
│   └── audio/                       # Audio files (imported as assets)
│       ├── select.mp3
│       ├── breaker.mp3
│       ├── switch.mp3
│       └── error.mp3
│
├── dist/                            # Build output (gitignored)
│   ├── index.html
│   ├── bundle.[hash].js
│   └── assets/
│
├── node_modules/                    # Dependencies (gitignored)
│
├── package.json                     # NPM dependencies and scripts
├── tsconfig.json                    # TypeScript configuration
├── webpack.config.js                # Webpack bundler configuration
├── .gitignore                       # Git ignore patterns
├── README.md                        # Project documentation
└── STRUCTURE.md                     # This file

```

## Component Hierarchy

```
App
├── Header
├── Body
│   └── Router (manages current page)
│       ├── LoginPage
│       │   ├── TeamSelect
│       │   ├── ServerSelect
│       │   └── JoinButton
│       │
│       ├── StudentPage
│       │   ├── TeamInfo
│       │   ├── SpectrumAnalyzerGrid
│       │   │   ├── SpectrumAnalyzerBox (x4)
│       │   │   │   └── SpectrumAnalyzer (canvas)
│       │   │   └── AnalyzerControl (modal)
│       │   │
│       │   └── ARTGrid (Antenna, RX, TX)
│       │       ├── AntennaCases
│       │       │   └── AntennaCase (x2)
│       │       │       └── AntennaController
│       │       │           ├── LoopbackSwitch
│       │       │           └── AntennaInput
│       │       │
│       │       ├── TxCases
│       │       │   └── TxCase (x4)
│       │       │       └── TxModem
│       │       │           ├── TxModemButtonBox
│       │       │           │   └── TxModemButton (x4)
│       │       │           └── TxModemInput
│       │       │
│       │       └── RxCases
│       │           └── RxCase (x4)
│       │               └── RxModem
│       │                   ├── RxModemButtonBox
│       │                   │   └── RxModemButton (x4)
│       │                   ├── RxModemInput
│       │                   └── RxVideo
│       │
│       └── InstructorPage
│           ├── Timeline
│           ├── SpectrumOverview
│           └── Injects
│
└── Footer
```

## Key Files by Functionality

### Routing & Navigation

- `src/services/Router.ts` - Client-side routing
- `src/App.ts` - Route initialization

### State Management

- `src/models/AppState.ts` - Global state (Singleton)
- `src/models/RfEnvironment.ts` - Signal environment

### Real-time Communication

- `src/services/SocketService.ts` - WebSocket client
- `src/services/ApiService.ts` - REST API client

### Equipment Logic

- `src/models/SpectrumAnalyzer.ts` - Spectrum analyzer calculations
- `src/components/equipment/*/` - Equipment UI components

### Utilities

- `src/components/Component.ts` - Base class for all components
- `src/utils/*` - Helper functions
- `src/constants/*` - Application constants

## Build Process

1. **TypeScript Compilation** (`ts-loader`)
   - Compiles `.ts` files to JavaScript
   - Type checking

2. **Asset Processing** (`webpack`)
   - Bundles JavaScript modules
   - Processes CSS with `style-loader` and `css-loader`
   - Handles images, fonts, audio as assets

3. **HTML Generation** (`html-webpack-plugin`)
   - Injects bundled scripts into HTML template
   - Copies to dist folder

4. **Output** (dist/)
   - Single bundled JS file (with hash for cache busting)
   - HTML with injected script tags
   - Asset files (images, fonts, videos)

## Development Workflow

1. Edit source files in `src/`
2. Webpack dev server auto-reloads on changes
3. TypeScript errors show in console
4. HMR (Hot Module Replacement) updates without full reload
5. Build for production creates optimized bundle in `dist/`
