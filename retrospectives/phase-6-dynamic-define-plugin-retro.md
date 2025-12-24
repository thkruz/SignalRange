# Retrospective: DynamicDefinePlugin Production Bug

## Context
I created a `DynamicDefinePlugin` class in `webpack.config.js` to inject `__APP_VERSION__` and `__GIT_COMMIT_SHA__` at build time. The intent was to support hot-reloading of version changes during development by re-evaluating the values on each compilation.

## What Went Wrong

The plugin applied `DefinePlugin` inside the `compilation` hook:

```javascript
compiler.hooks.compilation.tap('DynamicDefinePlugin', () => {
  new webpack.DefinePlugin(definitions).apply(compiler);
});
```

This is fundamentally broken. When `DefinePlugin.apply(compiler)` is called, it registers its own `compilation` hook handler. But that handler won't run for the *current* compilation—only subsequent ones.

- **Development (watch mode)**: Appeared to work because the second compilation (after a file change) would have the DefinePlugin from the first compilation registered.
- **Production (single build)**: No "next compilation" exists, so the variables were never replaced.

## What Worked
- The bug was caught before significant user impact
- Root cause analysis was straightforward once I understood webpack's hook lifecycle
- The fix was simple: move the definitions into a standard `DefinePlugin` at initialization time

## What Didn't Work
- I over-engineered the solution for a non-problem (version changes during dev sessions are rare)
- I didn't fully understand webpack's plugin lifecycle when writing the original code
- No test coverage for build-time constants being properly injected

## What to Change Next Time

1. **KISS**: A standard `DefinePlugin` is sufficient. Version/SHA values don't change during a single dev session, and if they do, restarting the dev server is acceptable.

2. **Understand the lifecycle**: Before hooking into build tool internals, understand the full event sequence. Webpack's `compilation` hook fires *after* the compilation object is created but *before* modules are processed—however, registering new plugin hooks during this phase doesn't affect the current compilation.

3. **Test production builds locally**: Running `npm run build` and checking the output would have caught this immediately.

4. **Simpler is better**: The "dynamic" behavior provided zero practical value while introducing a subtle timing bug. The extra complexity wasn't justified.
