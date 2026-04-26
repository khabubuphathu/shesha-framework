/**
 * Re-export HTTP types from `@shesha-io/core` so that existing imports of
 * `@/publicJsApis/httpClient` continue to work without modification.
 *
 * @packageDocumentation
 */
export type {
  HttpClientApi,
  HttpResponse,
  HttpRequestConfig,
  ResponseType,
} from '@shesha-io/core';
