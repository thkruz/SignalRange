# React to TypeScript Class Migration Guide

This guide explains how to convert React patterns to TypeScript class-based components.

## Table of Contents

1. [Component Conversion](#component-conversion)
2. [State Management](#state-management)
3. [Effects and Lifecycle](#effects-and-lifecycle)
4. [Event Handlers](#event-handlers)
5. [Props](#props)
6. [Context → Singleton](#context--singleton)
7. [Hooks → Class Methods](#hooks--class-methods)
8. [Common Patterns](#common-patterns)

---

## Component Conversion

### React Functional Component

```typescript
// React
export const MyComponent: React.FC<{ title: string }> = ({ title }) => {
  return <div className="my-component">{title}</div>;
};
```

### TypeScript Class Component

```typescript
// TypeScript Class
interface MyComponentProps {
  title: string;
}

export class MyComponent extends Component<MyComponentProps> {
  public render(): HTMLElement {
    const container = this.createElement('div', {
      className: 'my-component',
      textContent: this.props.title
    });

    this.element = container;
    return container;
  }
}
```

---

## State Management

### React useState

```typescript
// React
const [count, setCount] = useState(0);
const [user, setUser] = useState<User | null>(null);

return (
  <button onClick={() => setCount(count + 1)}>
    Count: {count}
  </button>
);
```

### TypeScript Class

```typescript
// TypeScript Class
export class Counter extends Component {
  private count: number = 0;
  private user: User | null = null;

  public render(): HTMLElement {
    const button = this.createElement('button', {
      textContent: `Count: ${this.count}`
    });

    button.addEventListener('click', () => {
      this.count++;
      this.update(); // Re-render
    });

    this.element = button;
    return button;
  }

  private update(): void {
    if (this.element) {
      const newElement = this.render();
      this.element.replaceWith(newElement);
    }
  }
}
```

---

## Effects and Lifecycle

### React useEffect

```typescript
// React
useEffect(() => {
  // Mount
  console.log('Component mounted');

  // Cleanup
  return () => {
    console.log('Component unmounted');
  };
}, []);

useEffect(() => {
  console.log('Count changed:', count);
}, [count]);
```

### TypeScript Class

```typescript
// TypeScript Class
export class MyComponent extends Component {
  public render(): HTMLElement {
    const element = this.createElement('div');

    // Mount logic
    this.onMount();

    this.element = element;
    return element;
  }

  private onMount(): void {
    console.log('Component mounted');

    // Setup listeners, subscriptions, etc.
  }

  public unmount(): void {
    console.log('Component unmounted');

    // Cleanup logic
    super.unmount();
  }

  // For watching specific values
  private previousCount: number = 0;

  public update(newProps: Partial<Props>): void {
    super.update(newProps);

    if (this.previousCount !== this.props.count) {
      console.log('Count changed:', this.props.count);
      this.previousCount = this.props.count;
    }
  }
}
```

---

## Event Handlers

### React onClick

```typescript
// React
const handleClick = useCallback(() => {
  console.log('Clicked!');
}, []);

return <button onClick={handleClick}>Click me</button>;
```

### TypeScript Class

```typescript
// TypeScript Class
export class MyButton extends Component {
  public render(): HTMLElement {
    const button = this.createElement('button', {
      textContent: 'Click me'
    });

    // Method 1: Inline
    button.addEventListener('click', () => {
      this.handleClick();
    });

    // Method 2: Bound method
    button.addEventListener('click', this.handleClick.bind(this));

    this.element = button;
    return button;
  }

  private handleClick(): void {
    console.log('Clicked!');
  }
}
```

---

## Props

### React Props

```typescript
// React
interface Props {
  name: string;
  age: number;
  onUpdate?: (name: string) => void;
}

export const UserCard: React.FC<Props> = ({ name, age, onUpdate }) => {
  return (
    <div>
      <h2>{name}</h2>
      <p>Age: {age}</p>
      <button onClick={() => onUpdate?.(name)}>Update</button>
    </div>
  );
};
```

### TypeScript Class

```typescript
// TypeScript Class
interface UserCardProps {
  name: string;
  age: number;
  onUpdate?: (name: string) => void;
}

export class UserCard extends Component<UserCardProps> {
  public render(): HTMLElement {
    const container = this.createElement('div');

    const title = this.createElement('h2', {
      textContent: this.props.name
    });

    const ageText = this.createElement('p', {
      textContent: `Age: ${this.props.age}`
    });

    const button = this.createElement('button', {
      textContent: 'Update'
    });

    button.addEventListener('click', () => {
      this.props.onUpdate?.(this.props.name);
    });

    container.appendChild(title);
    container.appendChild(ageText);
    container.appendChild(button);

    this.element = container;
    return container;
  }
}

// Usage
const card = new UserCard({
  name: 'John',
  age: 30,
  onUpdate: (name) => console.log('Update:', name)
});
```

---

## Context → Singleton

### React Context

```typescript
// React
const AppContext = createContext<AppState | null>(null);

export const AppProvider: React.FC = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  return (
    <AppContext.Provider value={{ user, setUser }}>
      {children}
    </AppContext.Provider>
  );
};

// Usage
const { user, setUser } = useContext(AppContext);
```

### TypeScript Singleton

```typescript
// TypeScript Singleton
export class AppState {
  private static instance: AppState;
  private listeners: Set<Function> = new Set();

  public user: User | null = null;

  private constructor() {}

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState();
    }
    return AppState.instance;
  }

  public subscribe(listener: Function): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public updateUser(user: User): void {
    this.user = user;
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach(listener => listener(this));
  }
}

// Usage
const state = AppState.getInstance();
const unsubscribe = state.subscribe((newState) => {
  console.log('User:', newState.user);
});
state.updateUser({ id: 1, name: 'John' });
```

---

## Hooks → Class Methods

### useCallback

```typescript
// React
const handleClick = useCallback(() => {
  console.log('Clicked!');
}, []);
```

```typescript
// TypeScript Class
private handleClick(): void {
  console.log('Clicked!');
}
// Methods are automatically bound when used with .bind(this)
```

### useMemo

```typescript
// React
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(input);
}, [input]);
```

```typescript
// TypeScript Class
private _cachedValue: any;
private _previousInput: any;

private get expensiveValue(): any {
  if (this._previousInput !== this.input) {
    this._cachedValue = this.computeExpensiveValue(this.input);
    this._previousInput = this.input;
  }
  return this._cachedValue;
}
```

### useRef

```typescript
// React
const inputRef = useRef<HTMLInputElement>(null);

return <input ref={inputRef} />;
```

```typescript
// TypeScript Class
private inputElement: HTMLInputElement | null = null;

public render(): HTMLElement {
  this.inputElement = this.createElement('input');
  return this.inputElement;
}
```

---

## Common Patterns

### Conditional Rendering

```typescript
// React
{isLoggedIn ? <Dashboard /> : <Login />}
```

```typescript
// TypeScript Class
public render(): HTMLElement {
  if (this.isLoggedIn) {
    return new Dashboard().render();
  } else {
    return new Login().render();
  }
}
```

### Lists

```typescript
// React
{items.map(item => (
  <li key={item.id}>{item.name}</li>
))}
```

```typescript
// TypeScript Class
private renderItems(): HTMLElement[] {
  return this.items.map(item => {
    return this.createElement('li', {
      textContent: item.name,
      attributes: { 'data-id': item.id.toString() }
    });
  });
}

public render(): HTMLElement {
  const ul = this.createElement('ul');
  this.renderItems().forEach(li => ul.appendChild(li));
  return ul;
}
```

### Forms

```typescript
// React
const [value, setValue] = useState('');

return (
  <input
    value={value}
    onChange={(e) => setValue(e.target.value)}
  />
);
```

```typescript
// TypeScript Class
private value: string = '';

public render(): HTMLElement {
  const input = this.createElement('input', {
    attributes: { value: this.value }
  }) as HTMLInputElement;

  input.addEventListener('input', (e) => {
    this.value = (e.target as HTMLInputElement).value;
    this.update();
  });

  this.element = input;
  return input;
}
```

---

## Migration Checklist

- [ ] Convert functional components to classes extending `Component`
- [ ] Replace `useState` with class properties
- [ ] Replace `useEffect` with lifecycle methods
- [ ] Replace `useContext` with `AppState.getInstance()`
- [ ] Replace `useCallback` with class methods
- [ ] Replace `useMemo` with getters or cached properties
- [ ] Replace `useRef` with class properties
- [ ] Convert JSX to `createElement` calls
- [ ] Add TypeScript types for all props and state
- [ ] Test component mounting/unmounting
- [ ] Verify event handlers are properly bound
- [ ] Ensure cleanup in `unmount()` method

---

## Tips

1. **Start with leaf components** - Convert components with no children first
2. **Test incrementally** - Convert and test each component before moving to the next
3. **Use type inference** - Let TypeScript infer types where possible
4. **Keep it simple** - Don't over-engineer; match the original behavior
5. **Document complex logic** - Add comments for non-obvious conversions
6. **Maintain file structure** - Keep similar folder organization as React app
