import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// false during SSR and the hydration render, true afterwards. Lets components
// that depend on the client's clock/locale render a stable placeholder first,
// so server and client HTML match.
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
