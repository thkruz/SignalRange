# IRIS - Space Electronic Warfare Sandbox (TypeScript Rewrite)

A comprehensive training environment for Space Electronic Warfare, rewritten in TypeScript with vanilla JavaScript (no React).

## 🚀 Project Overview

IRIS is a web-based simulation for learning Space Electronic Warfare operations. It provides:

- **4x Spectrum Analyzers** - Visualize RF signals in real-time
- **2x Antennas** - C-band and Ku-band antenna systems
- **4x Transmitter Cases** (16 modems) - Generate jamming signals
- **4x Receiver Cases** (16 modems) - Receive and decode satellite transmissions
- Real-time signal processing and analysis
- Multi-team collaborative environment

## 🏗️ Architecture

### Tech Stack

- **TypeScript** - Type-safe code throughout
- **Vanilla JavaScript** - No framework dependencies
- **Webpack** - Module bundling and development server
- **Socket.IO** - Real-time communication
- **Canvas API** - Spectrum analyzer visualization

### Project Structure

```
iris-ts/
├── public/                 # Static assets
│   ├── index.html         # HTML template
│   ├── patch.png          # Logo
│   ├── bezel.png          # UI bezel image
│   └── videos/            # Signal video feeds
├── src/
│   ├── index.ts           # Application entry point
│   ├── App.ts             # Main application class
│   ├── components/        # UI components
│   │   ├── Component.ts   # Base component class
│   │   ├── layout/        # Layout components
│   │   │   ├── Header.ts
│   │   │   ├── Body.ts
│   │   │   └── Footer.ts
│   │   ├── equipment/     # Equipment components
│   │   │   ├── SpectrumAnalyzer/
│   │   │   ├── Antenna/
│   │   │   ├── Transmitter/
│   │   │   └── Receiver/
│   │   └── common/        # Shared components
│   ├── models/            # Data models and state
│   │   ├── AppState.ts    # Global state manager
│   │   ├── RfEnvironment.ts
│   │   └── SpectrumAnalyzer.ts
│   ├── pages/             # Page components
│   │   ├── LoginPage.ts
│   │   ├── StudentPage.ts
│   │   └── InstructorPage.ts
│   ├── services/          # Business logic services
│   │   ├── Router.ts      # Client-side routing
│   │   ├── SocketService.ts
│   │   ├── ApiService.ts
│   │   └── AudioService.ts
│   ├── utils/             # Utility functions
│   ├── constants/         # Application constants
│   ├── types/             # TypeScript type definitions
│   └── styles/            # CSS stylesheets
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

## 🎯 Design Principles

### 1. Class-Based Architecture

All components extend a base `Component` class that provides:

- Lifecycle management (render, update, unmount)
- DOM manipulation helpers
- Event handling utilities

### 2. Singleton State Management

The `AppState` class uses the Singleton pattern to manage global application state:

- Replaces React Context
- Observer pattern for state changes
- Type-safe state updates

### 3. Service Layer

Business logic is separated into services:

- `Router` - Handles client-side routing
- `SocketService` - WebSocket communication
- `ApiService` - REST API calls
- `AudioService` - Sound effects

### 4. Type Safety

Full TypeScript coverage ensures:

- Compile-time error checking
- IntelliSense support
- Better code documentation
- Easier refactoring

## 🔧 Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

Opens at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

### Type Checking

```bash
npm run type-check
```

## 📝 Key Conversions from React

| React Pattern | TypeScript Equivalent |
|--------------|----------------------|
| `useState` | Class properties + `update()` method |
| `useEffect` | Lifecycle methods in Component class |
| `useContext` | `AppState.getInstance()` singleton |
| `useCallback` | Class methods (automatically bound) |
| JSX | `createElement()` helper methods |
| React Router | Custom `Router` service |
| Props | Constructor parameters & class properties |

## 🎮 Usage Example

### Creating a Component

```typescript
import { Component } from './components/Component';

interface MyComponentProps {
  title: string;
  value: number;
}

export class MyComponent extends Component<MyComponentProps> {
  public render(): HTMLElement {
    const container = this.createElement('div', {
      className: 'my-component'
    });

    const title = this.createElement('h2', {
      textContent: this.props.title
    });

    container.appendChild(title);
    this.element = container;

    return container;
  }
}
```

### Using State

```typescript
import { AppState } from './models/AppState';

const state = AppState.getInstance();

// Subscribe to changes
const unsubscribe = state.subscribe((newState) => {
  console.log('State updated:', newState);
});

// Update state
state.updateUser({ id: 1, team_id: 1, server_id: 1 });

// Cleanup
unsubscribe();
```

## 🔌 WebSocket Integration

The application uses Socket.IO for real-time updates:

```typescript
import { SocketService } from './services/SocketService';

const socket = SocketService.getInstance();

socket.on('updateSpecA', (data) => {
  // Handle spectrum analyzer update
});

socket.emit('transmitterChange', transmitterData);
```

## 🎨 Styling

CSS is modular and component-scoped:

- Each component has its own CSS file
- Global styles in `src/styles/index.css`
- Theme constants in TypeScript (no CSS-in-JS)

## 📦 Building Components

Components follow this pattern:

1. **Extend Component base class**
2. **Implement render() method**
3. **Use createElement() helpers**
4. **Subscribe to state changes if needed**
5. **Clean up in destroy() method**

## 🧪 Testing Strategy

(To be implemented)

- Unit tests with Jest
- Integration tests for complex workflows
- E2E tests with Playwright

## 📄 License

AGPLv3 - See LICENSE.md

## 👥 Authors

- Theodore Kruczek ([@thkruz](https://github.com/thkruz))
- Original React version contributors: Askins, Gilmore, Hufstetler, Peters

## 🙏 Acknowledgments

United States Space Force Supra Coders: Blended Software Development Immersion #1
