import { useSyncExternalStore } from 'react';

export interface Store<S> {
  get(): S;
  set(fn: (s: S) => S): void;
  subscribe(cb: () => void): () => void;
}
export function createStore<S>(init: S): Store<S> {
  let s = init;
  const subs = new Set<() => void>();
  return {
    get: () => s,
    set(fn) {
      const next = fn(s);
      if (next === s) return;
      s = next;
      subs.forEach((x) => x());
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}
/** Selectors must return stable references (state slices), not freshly built objects. */
export function useSel<S, T>(store: Store<S>, sel: (s: S) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(store.get()), () => sel(store.get()));
}
