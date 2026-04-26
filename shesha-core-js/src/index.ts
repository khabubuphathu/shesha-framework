/**
 * @shesha-io/core
 *
 * Framework-agnostic core of the Shesha framework.
 *
 * This package provides:
 * - {@link HttpClientApi} — a framework-agnostic HTTP client interface
 * - {@link SheshaPlugin} / {@link SheshaPluginContext} — the plugin contract
 * - {@link SheshaClient} — the central application lifecycle manager
 * - {@link createShesha} — the preferred factory for creating a `SheshaClient`
 * - {@link SheshaEventEmitter} — a typed, minimal event emitter used internally
 *   and exposed so framework adapters can subscribe to state changes
 *
 * Framework-specific packages (`@shesha-io/react`, future `@shesha-io/vue`, …)
 * depend on this package and wrap it with their own reactivity mechanisms.
 *
 * @packageDocumentation
 */

// HTTP
export type { HttpClientApi, HttpResponse, HttpRequestConfig, ResponseType } from './http/index.js';

// Events
export { SheshaEventEmitter } from './events/index.js';
export type { SheshaListener } from './events/index.js';

// Plugins
export type {
  SheshaPlugin,
  SheshaPluginContext,
  ISheshaClient,
  InferPluginApi,
  PluginApiMap,
} from './plugins/index.js';

// Client
export {
  SheshaClient,
  createShesha,
} from './client.js';
export type {
  SheshaClientStatus,
  SheshaClientState,
  SheshaClientEvents,
  SheshaClientOptions,
} from './client.js';
