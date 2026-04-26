/**
 * Internal event map for {@link SheshaEventEmitter}.
 * The constraint is `Record<string, unknown>`.
 */
export type SheshaListener<TPayload = void> = (payload: TPayload) => void;

/**
 * Minimal, framework-agnostic typed event emitter used internally by `SheshaClient`
 * to broadcast state-change notifications.
 *
 * Framework adapters (React, Vue, …) subscribe to the events they care about and
 * trigger their own re-render cycles accordingly.
 *
 * @example
 * ```ts
 * const emitter = new SheshaEventEmitter<{ change: void; error: Error }>();
 * const off = emitter.on('change', () => console.log('changed'));
 * emitter.emit('change');
 * off(); // unsubscribe
 * ```
 */
export class SheshaEventEmitter<TEvents extends Record<string, unknown> = Record<string, unknown>> {
  readonly #listeners = new Map<keyof TEvents, Set<SheshaListener<TEvents[keyof TEvents]>>>();

  /**
   * Subscribe to an event.
   * @returns An unsubscribe function — call it to remove the listener.
   */
  on<K extends keyof TEvents>(event: K, listener: SheshaListener<TEvents[K]>): () => void {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set as Set<SheshaListener<TEvents[keyof TEvents]>>);
    }
    (set as Set<SheshaListener<TEvents[K]>>).add(listener);

    return () => this.off(event, listener);
  }

  /**
   * Remove a previously registered listener.
   */
  off<K extends keyof TEvents>(event: K, listener: SheshaListener<TEvents[K]>): void {
    const set = this.#listeners.get(event) as Set<SheshaListener<TEvents[K]>> | undefined;
    set?.delete(listener);
  }

  /**
   * Emit an event, calling all registered listeners synchronously.
   */
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.#listeners.get(event) as Set<SheshaListener<TEvents[K]>> | undefined;
    if (!set) return;
    for (const listener of set) {
      listener(payload);
    }
  }

  /**
   * Remove all listeners, optionally restricted to a single event.
   */
  clear<K extends keyof TEvents>(event?: K): void {
    if (event !== undefined) {
      this.#listeners.delete(event);
    } else {
      this.#listeners.clear();
    }
  }
}
