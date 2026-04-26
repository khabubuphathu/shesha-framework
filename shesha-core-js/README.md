# `@shesha-io/core`

Framework-agnostic core of the [Shesha framework](https://www.shesha.io/).

This package contains **no framework dependencies** (no React, no Vue, …).  
It provides the plugin infrastructure, HTTP client contract, and application lifecycle manager that framework-specific adapters build on top of.

## Installation

```bash
npm install @shesha-io/core
```

> **Note** — if you are building a React application, install `@shesha-io/react` instead.  
> It re-exports everything from `@shesha-io/core` so you do not need both.

## Quick Start

```ts
import { createShesha } from '@shesha-io/core';

const shesha = createShesha({
  backendUrl: 'https://api.example.com',
  applicationKey: 'my-app',
  plugins: [
    analyticsPlugin(),
    mapsPlugin({ apiKey: process.env.MAPS_API_KEY }),
  ],
});

// Initialise (call plugin init() hooks in order)
await shesha.init(myHttpClient);

// Access plugin APIs
shesha.api.analytics.track('page_view');
```

## Plugin Contract

A plugin is a plain object that satisfies `SheshaPlugin`:

```ts
import type { SheshaPlugin, SheshaPluginContext } from '@shesha-io/core';

const analyticsPlugin = (): SheshaPlugin<'analytics', AnalyticsApi> => ({
  name: 'analytics',

  // Called once during shesha.init()
  async init({ httpClient }: SheshaPluginContext) {
    await httpClient.get('/api/analytics/ping');
  },

  // Contributes typed api to shesha.api.analytics
  api({ httpClient }: SheshaPluginContext) {
    return new AnalyticsApi(httpClient);
  },
});
```

## Framework Adapters

| Package | Framework |
|---|---|
| `@shesha-io/react` | React / Next.js |
| `@shesha-io/vue` _(planned)_ | Vue 3 |

## Subscribing to State Changes

Framework adapters connect `SheshaClient` to their own reactivity by subscribing to events:

```ts
// React example (simplified)
useEffect(() => {
  return shesha.on('stateChanged', () => forceUpdate({}));
}, [shesha]);
```

## API Reference

### `createShesha(options)`

Factory that creates a `SheshaClient` with full TypeScript inference for registered plugins.

### `SheshaClient`

| Member | Description |
|---|---|
| `backendUrl` | Backend base URL |
| `applicationKey` | Front-end app identifier |
| `state` | Current `SheshaClientState` snapshot |
| `api` | Typed plugin API surface |
| `init(httpClient)` | Run plugin `init()` hooks |
| `registerPlugin(plugin)` | Runtime plugin registration |
| `unregisterPlugin(name)` | Runtime plugin removal |
| `getPlugin(name)` | Look up a registered plugin |
| `on(event, listener)` | Subscribe to client events |

### `SheshaEventEmitter`

A minimal typed event emitter. Exposed so you can use it in your own plugins.
