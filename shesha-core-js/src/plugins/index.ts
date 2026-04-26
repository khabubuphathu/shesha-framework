import type { HttpClientApi } from '../http/index.js';

// Forward-declare SheshaClient as an interface so plugins.ts can reference it
// without creating a circular dependency.
/**
 * Minimal view of `SheshaClient` exposed to plugin lifecycle hooks.
 * Using an interface avoids importing the full class into this file.
 */
export interface ISheshaClient {
  readonly backendUrl: string;
  readonly applicationKey: string | undefined;
  readonly applicationName: string | undefined;
  hasPlugin(name: string): boolean;
}

/**
 * Context object passed to plugin lifecycle hooks.
 * Gives plugins access to the HTTP client and the application client instance.
 */
export interface SheshaPluginContext {
  /** HTTP client pre-configured with backend URL and standard headers. */
  readonly httpClient: HttpClientApi;
  /** The running `SheshaClient` instance (via its public interface). */
  readonly client: ISheshaClient;
}

/**
 * A Shesha plugin definition.
 *
 * Plugins follow the better-auth pattern: a plain object (or factory function
 * returning a plain object) that carries a unique `name`, optional async
 * `init` work, and an optional `api` factory that contributes typed properties
 * to the application API surface.
 *
 * @typeParam TName - Literal string name of the plugin (used for typed lookup).
 * @typeParam TApi  - Shape of the public API object contributed by this plugin.
 *
 * @example
 * ```ts
 * // Define a plugin
 * const analyticsPlugin = (): SheshaPlugin<'analytics', AnalyticsApi> => ({
 *   name: 'analytics',
 *   async init({ httpClient }) {
 *     await httpClient.get('/api/analytics/ping');
 *   },
 *   api({ httpClient }) {
 *     return new AnalyticsApi(httpClient);
 *   },
 * });
 *
 * // Register at startup
 * const shesha = createShesha({
 *   backendUrl: 'https://my-api.com',
 *   plugins: [analyticsPlugin()],
 * });
 * ```
 */
export interface SheshaPlugin<TName extends string = string, TApi = unknown> {
  /**
   * Unique identifier for this plugin.
   * Used as the property key on the application API object.
   */
  readonly name: TName;

  /**
   * Optional async initialisation hook.
   * Called once during `SheshaClient.init()`, in registration order.
   * Suitable for pre-fetching config, verifying connectivity, etc.
   */
  init?: (ctx: SheshaPluginContext) => Promise<void>;

  /**
   * Optional API factory.
   * When provided, the returned object is exposed as `shesha.api.<name>`.
   */
  api?: (ctx: SheshaPluginContext) => TApi;
}

/**
 * Infer the `api` type produced by a {@link SheshaPlugin}.
 *
 * @example
 * ```ts
 * type AnalyticsApiType = InferPluginApi<typeof analyticsPlugin>;
 * ```
 */
export type InferPluginApi<TPlugin extends SheshaPlugin> =
  TPlugin extends SheshaPlugin<string, infer TApi> ? TApi : never;

/**
 * Infer a union of `{ name, api }` pairs from a tuple of plugins.
 * Used internally by `createShesha` to build a strongly-typed result.
 */
export type PluginApiMap<TPlugins extends readonly SheshaPlugin[]> = {
  [K in TPlugins[number]['name']]: Extract<TPlugins[number], SheshaPlugin<K>>['api'] extends (ctx: SheshaPluginContext) => infer TApi
    ? TApi
    : never;
};
