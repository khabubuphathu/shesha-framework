/**
 * HTTP response shape returned by every HTTP method.
 */
export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  request?: unknown;
}

/**
 * Supported response body types.
 */
export type ResponseType =
  | 'arraybuffer'
  | 'blob'
  | 'document'
  | 'json'
  | 'text'
  | 'stream'
  | 'formdata';

/**
 * Per-request configuration options.
 */
export interface HttpRequestConfig {
  /** Additional request headers (merged on top of standard headers). */
  headers?: Record<string, string>;
  /**
   * When `true` the standard application headers (auth token, frontend-app key, etc.)
   * are NOT added to this request.
   */
  omitStandardHeaders?: boolean;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Expected response body type. */
  responseType?: ResponseType;
  /** AbortSignal for request cancellation. */
  signal?: AbortSignal;
}

/**
 * Framework-agnostic HTTP client interface.
 *
 * Any implementation — Axios, Fetch API, a test double — must satisfy this contract.
 * The React adapter (`@shesha-io/react`) ships a concrete `AxiosHttpClient` that the
 * `useHttpClient()` hook returns.
 */
export interface HttpClientApi {
  get<T = unknown, R = HttpResponse<T>>(url: string, config?: HttpRequestConfig): Promise<R>;
  delete<T = unknown, R = HttpResponse<T>>(url: string, config?: HttpRequestConfig): Promise<R>;
  head<T = unknown, R = HttpResponse<T>>(url: string, config?: HttpRequestConfig): Promise<R>;
  options<T = unknown, R = HttpResponse<T>>(url: string, config?: HttpRequestConfig): Promise<R>;
  post<T = unknown, R = HttpResponse<T>, D = unknown>(url: string, data?: D, config?: HttpRequestConfig): Promise<R>;
  put<T = unknown, R = HttpResponse<T>, D = unknown>(url: string, data?: D, config?: HttpRequestConfig): Promise<R>;
  patch<T = unknown, R = HttpResponse<T>, D = unknown>(url: string, data?: D, config?: HttpRequestConfig): Promise<R>;
}
