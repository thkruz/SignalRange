# IRIS TypeScript - Quick Start Guide

## 📋 What We've Built

A complete TypeScript scaffolding for the IRIS Space Electronic Warfare Sandbox, converted from React to vanilla TypeScript with classes.

## ✅ What's Included

### Core Files

- ✅ `package.json` - Dependencies and scripts
- ✅ `tsconfig.json` - TypeScript configuration
- ✅ `webpack.config.js` - Build configuration
- ✅ `.gitignore` - Git ignore patterns

### Source Structure

```
src/
├── index.ts                    # Entry point
├── App.ts                      # Main application class
├── components/
│   ├── Component.ts           # Base component class
│   └── layout/                # Header, Body, Footer
├── models/
│   └── AppState.ts           # Global state (Singleton)
├── pages/                     # Login, Student, Instructor
├── services/
│   └── Router.ts             # Client-side routing
├── types/                     # TypeScript definitions
├── constants/                 # App constants
└── styles/                    # Global CSS
```

### Documentation

- ✅ `README.md` - Project overview
- ✅ `STRUCTURE.md` - Complete directory structure
- ✅ `MIGRATION.md` - React to TypeScript conversion guide
- ✅ `QUICKSTART.md` - This file

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The app will open at `http://localhost:3000`

### 3. Build for Production

```bash
npm run build
```

Output will be in `/home/claude/dist/`

## 📝 Next Steps

### Immediate Tasks

1. **Add Static Assets**
   - Place images in `public/` folder:
     - `patch.png` (logo)
     - `bezel.png` (UI bezel)
     - `baseball_switch.png` & `baseball_switch2.png`
     - `nasalization-rg.otf` (NASA font)

2. **Implement Core Components**
   Start with these in order:
   - Login page components (TeamSelect, ServerSelect)
   - Spectrum Analyzer (most complex, canvas-based)
   - Antenna components
   - Transmitter components
   - Receiver components

3. **Add Services**
   - `SocketService.ts` - WebSocket communication
   - `ApiService.ts` - REST API calls
   - `AudioService.ts` - Sound effects

4. **Create Models**
   - `RfEnvironment.ts` - Signal environment
   - `SpectrumAnalyzer.ts` - Analyzer logic

### Component Priority

**Phase 1: Login & Layout** ✅ (Done)

- Header
- Body
- Footer
- LoginPage

**Phase 2: Core Equipment**

- SpectrumAnalyzer (canvas drawing)
- SpectrumAnalyzerBox (container)
- SpectrumAnalyzerGrid (4-unit grid)

**Phase 3: Antenna System**

- AntennaCase
- AntennaController
- LoopbackSwitch
- AntennaInput

**Phase 4: Transmitters**

- TxCase
- TxModem
- TxModemButtonBox
- TxModemInput

**Phase 5: Receivers**

- RxCase
- RxModem
- RxModemButtonBox
- RxModemInput
- RxVideo

## 💡 Key Patterns

### Creating a Component

```typescript
import { Component } from './Component';

interface MyProps {
  title: string;
  value: number;
}

export class MyComponent extends Component<MyProps> {
  public render(): HTMLElement {
    const div = this.createElement('div', {
      className: 'my-component'
    });

    // Add children...

    this.element = div;
    return div;
  }
}
```

### Using State

```typescript
const state = AppState.getInstance();

// Subscribe
const unsubscribe = state.subscribe(() => {
  this.update(); // Re-render
});

// Update
state.updateAntennas(newAntennas);
```

### Routing

```typescript
// In a component
this.addEventListener(button, 'click', () => {
  const router = new Router();
  router.navigate('/student', { isAuthenticated: true });
});
```

## 🔧 Development Workflow

1. **Edit source files** in `src/`
2. **Webpack auto-reloads** on changes
3. **Check TypeScript errors** in terminal
4. **Test in browser** at localhost:3000

## 📚 Helpful Commands

```bash
# Development
npm run dev          # Start dev server with HMR

# Building
npm run build        # Production build
npm run clean        # Remove dist folder

# Type Checking
npm run type-check   # Check TypeScript without building
```

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### TypeScript Errors

```bash
# Check for type errors
npm run type-check
```

### Module Not Found

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 📖 Reference Documents

- **Project Overview**: `README.md`
- **Full Structure**: `STRUCTURE.md`
- **Migration Guide**: `MIGRATION.md`
- **Type Definitions**: `src/types/index.ts`
- **Constants**: `src/constants/index.ts`

## 🎯 Architecture Overview

```
┌──────────────────────────────────────┐
│              App.ts                  │
│    (Main Orchestrator)               │
└────────┬─────────────────────────────┘
         │
    ┌────┴────┬──────────┬────────┐
    │         │          │        │
  Header    Body      Footer   Router
            │
        ┌───┴───┐
        │ Pages │
        └───┬───┘
            │
    ┌───────┼───────┐
    │       │       │
  Login  Student Instructor
         │
    ┌────┴────┐
    │Components│
    └────┬────┘
         │
   ┌─────┴─────┐
   │ Equipment │
   └───────────┘
```

## 🎨 Styling Approach

- CSS modules per component
- Global styles in `src/styles/index.css`
- Theme colors as CSS variables (can be added)
- No CSS-in-JS libraries

## 🔗 External Dependencies

- **socket.io-client**: Real-time communication
- **webpack**: Module bundling
- **typescript**: Type checking
- **ts-loader**: TypeScript compilation

## ✨ Features to Implement

- [ ] WebSocket connection to backend
- [ ] Canvas-based spectrum analyzer
- [ ] Real-time signal processing
- [ ] Equipment state synchronization
- [ ] Video feed display
- [ ] Sound effects
- [ ] Help modals
- [ ] Error handling
- [ ] Loading states

## 🎓 Learning Resources

- TypeScript Handbook: <https://www.typescriptlang.org/docs/>
- Canvas API: <https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API>
- Socket.IO Client: <https://socket.io/docs/v4/client-api/>

## 🤝 Contributing

When adding new components:

1. Extend `Component` base class
2. Add TypeScript types in `src/types/`
3. Update `STRUCTURE.md` if adding new folders
4. Follow existing naming conventions
5. Keep components focused and single-purpose

## 📞 Support

For questions about the original React codebase, refer to:

- Original repository: <https://github.com/thkruz/iris>
- Project files are available in `/mnt/project/`

---

**Ready to start coding!** 🚀

Begin with implementing the Login page components, then move to the Spectrum Analyzer.
