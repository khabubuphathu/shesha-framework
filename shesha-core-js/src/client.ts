import type { HttpClientApi } from './http/index.js';
import { SheshaEventEmitter } from './events/index.js';
import type { SheshaPlugin, SheshaPluginContext, PluginApiMap } from './plugins/index.js';

// ---------------------------------------------------------------------------
// Public status + state types
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of the Shesha application.
 *
 * - `waiting`    — not yet started
 * - `inprogress` — `init()` is running
 * - `ready`      — fully initialised
 * - `failed`     — initialisation threw an error
 */
export type SheshaClientStatus = 'waiting' | 'inprogress' | 'ready' | 'failed';

/**
 * Snapshot of `SheshaClient` initialisation state.
 */
export interface SheshaClientState {
  readonly status: SheshaClientStatus;
  readonly hint?: string;
  readonly error?: Error;
}

// ---------------------------------------------------------------------------
// Event map
// ---------------------------------------------------------------------------

/**
 * Events emitted by `SheshaClient`.
 * Framework adapters subscribe to these to trigger their own re-renders.
 */
export interface SheshaClientEvents extends Record<string, unknown> {
  /** Fired whenever `state` changes (status, hint, error). */
  stateChanged: SheshaClientState;
  /** Fired when a plugin is added at runtime. */
  pluginAdded: SheshaPlugin;
  /** Fired when a plugin is removed at runtime. */
  pluginRemoved: string;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options passed to {@link createShesha}.
 *
 * @typeParam TPlugins Tuple type of the registered plugins (inferred automatically).
 */
export interface SheshaClientOptions<TPlugins extends readonly SheshaPlugin[] = readonly SheshaPlugin[]> {
  /**
   * Base URL of the Shesha backend (e.g. `'https://my-api.example.com'`).
   * Must **not** include a trailing slash.
   */
  backendUrl: string;

  /**
   * Unique key that identifies this front-end application.
   * Used to separate settings and configuration when multiple front-ends share
   * the same backend.
   */
  applicationKey?: string;

  /** Human-readable application name. */
  applicationName?: string;

  /**
   * Plugins to register at startup.
   * Each plugin's `init()` hook is called during {@link SheshaClient.init}.
   */
  plugins?: TPlugins;
}

// ---------------------------------------------------------------------------
// SheshaClient
// ---------------------------------------------------------------------------

/**
 * Framework-agnostic core of a Shesha application.
 *
 * Create one instance per application using {@link createShesha}, then connect
 * it to your framework's reactivity layer (React context, Vue reactive state, …)
 * by subscribing to the `stateChanged` event.
 *
 * @example
 * ```ts
 * const shesha = createShesha({
 *   backendUrl: 'https://api.example.com',
 *   plugins: [analyticsPlugin(), mapsPlugin({ apiKey: '…' })],
 * });
 *
 * // React adapter
 * useEffect(() => {
 *   return shesha.on('stateChanged', () => forceUpdate({}));
 * }, [shesha]);
 * ```
 */
export class SheshaClient<TPlugins extends readonly SheshaPlugin[] = readonly SheshaPlugin[]> {
  // -------------------------------------------------------------------------
  // Private fields
  // -------------------------------------------------------------------------

  readonly #backendUrl: string;

  readonly #applicationKey: string | undefined;

  readonly #applicationName: string | undefined;

  readonly #plugins = new Map<string, SheshaPlugin>();

  /**
   * Runtime API objects contributed by plugins.
   * Exposed via `api` as a read-only proxy so consumers get typed access.
   */
  readonly #pluginApis: Record<string, unknown> = {};

  #state: SheshaClientState = { status: 'waiting' };

  readonly #emitter = new SheshaEventEmitter<SheshaClientEvents>();

  // -------------------------------------------------------------------------
  // Public accessors
  // -------------------------------------------------------------------------

  /** Backend base URL. */
  get backendUrl(): string {
    return this.#backendUrl;
  }

  /** Application key (front-end identifier). */
  get applicationKey(): string | undefined {
    return this.#applicationKey;
  }

  /** Application display name. */
  get applicationName(): string | undefined {
    return this.#applicationName;
  }

  /** Current initialisation state snapshot. */
  get state(): SheshaClientState {
    return this.#state;
  }

  /**
   * Typed API surface contributed by registered plugins.
   *
   * The type is derived automatically from `TPlugins` when using
   * {@link createShesha}.
   */
  get api(): PluginApiMap<TPlugins> {
    return this.#pluginApis as PluginApiMap<TPlugins>;
  }

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor(options: SheshaClientOptions<TPlugins>) {
    this.#backendUrl = options.backendUrl;
    this.#applicationKey = options.applicationKey;
    this.#applicationName = options.applicationName;

    // Pre-register static plugins
    for (const plugin of options.plugins ?? []) {
      this.#registerPluginInternal(plugin);
    }
  }

  // -------------------------------------------------------------------------
  // Event subscription
  // -------------------------------------------------------------------------

  /**
   * Subscribe to a {@link SheshaClientEvents client event}.
   * @returns An unsubscribe function — call it to remove the listener.
   */
  on<K extends keyof SheshaClientEvents>(
    event: K,
    listener: (payload: SheshaClientEvents[K]) => void,
  ): () => void {
    return this.#emitter.on(event, listener);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialise the application.
   *
   * Calls each plugin's `init()` hook in registration order.
   * The provided `httpClient` is passed to every plugin via
   * {@link SheshaPluginContext}.
   *
   * @param httpClient - Concrete HTTP client implementation (e.g. `AxiosHttpClient`
   *   from `@shesha-io/react`).
   */
  async init(httpClient: HttpClientApi): Promise<void> {
    this.#setState({ status: 'inprogress', hint: 'Initializing...' });

    const ctx: SheshaPluginContext = { httpClient, client: this };

    try {
      for (const plugin of this.#plugins.values()) {
        if (plugin.init) {
          await plugin.init(ctx);
        }
      }

      // Build plugin API objects after successful init
      for (const plugin of this.#plugins.values()) {
        if (plugin.api) {
          this.#pluginApis[plugin.name] = plugin.api(ctx);
        }
      }

      this.#setState({ status: 'ready' });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.#setState({ status: 'failed', error: err });
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Plugin registry
  // -------------------------------------------------------------------------

  /**
   * Register a plugin at runtime.
   *
   * Useful for framework adapters that need to mount/unmount plugins based on
   * component lifecycle (e.g. a React provider that registers a plugin on
   * mount and unregisters it on unmount).
   *
   * @throws If a plugin with the same name is already registered.
   */
  registerPlugin(plugin: SheshaPlugin): void {
    this.#registerPluginInternal(plugin);
    this.#emitter.emit('pluginAdded', plugin);
  }

  /**
   * Unregister a previously registered plugin by name.
   *
   * @throws If no plugin with that name is registered.
   */
  unregisterPlugin(name: string): void {
    if (!this.#plugins.has(name)) {
      throw new Error(`[@shesha-io/core] No plugin registered with name '${name}'`);
    }
    this.#plugins.delete(name);
    delete this.#pluginApis[name];
    this.#emitter.emit('pluginRemoved', name);
  }

  /**
   * Retrieve a registered plugin by name.
   * Returns `undefined` if no plugin with that name exists.
   */
  getPlugin<TName extends string, TApi = unknown>(name: TName): SheshaPlugin<TName, TApi> | undefined {
    return this.#plugins.get(name) as SheshaPlugin<TName, TApi> | undefined;
  }

  /**
   * Returns `true` if a plugin with the given name is registered.
   */
  hasPlugin(name: string): boolean {
    return this.#plugins.has(name);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  #registerPluginInternal(plugin: SheshaPlugin): void {
    if (this.#plugins.has(plugin.name)) {
      throw new Error(`[@shesha-io/core] A plugin with name '${plugin.name}' is already registered`);
    }
    this.#plugins.set(plugin.name, plugin);
  }

  #setState(next: SheshaClientState): void {
    this.#state = next;
    this.#emitter.emit('stateChanged', next);
  }
}

// ---------------------------------------------------------------------------
// createShesha factory
// ---------------------------------------------------------------------------

/**
 * Create a new `SheshaClient` — the entry point of `@shesha-io/core`.
 *
 * Call this once in your application bootstrap, then pass the returned client
 * to your framework adapter (e.g. `ShaApplicationProvider` in
 * `@shesha-io/react`).
 *
 * ```ts
 * import { createShesha } from '@shesha-io/core';
 *
 * const shesha = createShesha({
 *   backendUrl: 'https://api.example.com',
 *   applicationKey: 'my-app',
 *   plugins: [
 *     analyticsPlugin(),
 *     mapsPlugin({ apiKey: process.env.MAPS_API_KEY }),
 *   ],
 * });
 * ```
 *
 * @typeParam TPlugins - Inferred from the `plugins` array — gives full type-
 *   safety for `shesha.api.<pluginName>` access.
 */
export const createShesha = <TPlugins extends readonly SheshaPlugin[]>(
  options: SheshaClientOptions<TPlugins>,
): SheshaClient<TPlugins> => {
  return new SheshaClient<TPlugins>(options);
};
