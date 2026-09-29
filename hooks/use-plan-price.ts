"use client";

import { useSyncExternalStore } from "react";

// The Claude subscription tier the Overview's "Value vs your plan" card
// compares API-equivalent spend against. Persisted in localStorage so it
// survives reloads; read through useSyncExternalStore so the server render and
// the hydration render both use DEFAULT_PLAN_PRICE (no mismatch) and the real
// stored value is swapped in right after hydration.
export const PLAN_PRICES = [20, 100, 200] as const;
export type PlanPrice = (typeof PLAN_PRICES)[number];
export const DEFAULT_PLAN_PRICE: PlanPrice = 200;
export const PLAN_STORAGE_KEY = "plan-price";

export function parsePlanPrice(raw: string | null | undefined): PlanPrice {
  const n = Number(raw);
  return (PLAN_PRICES as readonly number[]).includes(n) ? (n as PlanPrice) : DEFAULT_PLAN_PRICE;
}

// The slice of the Storage API the store needs, so it can be driven by a fake
// in tests (and by nothing when storage is unavailable).
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PlanPriceStore {
  subscribe(cb: () => void): () => void;
  getSnapshot(): PlanPrice;
  set(price: PlanPrice): void;
}

/**
 * External store over an injectable storage. If storage is missing or throws
 * (blocked in private mode), the choice is kept in memory for the page's life
 * so the control still works; it just won't persist.
 */
export function createPlanPriceStore(getStorage: () => StorageLike | null): PlanPriceStore {
  const listeners = new Set<() => void>();
  let memory: PlanPrice | null = null;
  const notify = () => listeners.forEach((l) => l());
  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    getSnapshot() {
      try {
        const raw = getStorage()?.getItem(PLAN_STORAGE_KEY);
        if (raw != null) return parsePlanPrice(raw);
      } catch {
        /* blocked: fall through to memory */
      }
      return memory ?? DEFAULT_PLAN_PRICE;
    },
    set(price) {
      memory = price;
      try {
        getStorage()?.setItem(PLAN_STORAGE_KEY, String(price));
      } catch {
        /* blocked: memory keeps it for this page load */
      }
      notify(); // same-tab subscribers (the `storage` event only fires in OTHER tabs)
    },
  };
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = createPlanPriceStore(browserStorage);

function subscribe(cb: () => void) {
  const off = store.subscribe(cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    off();
    window.removeEventListener("storage", cb);
  };
}

export function usePlanPrice(): [PlanPrice, (price: PlanPrice) => void] {
  const price = useSyncExternalStore(subscribe, store.getSnapshot, () => DEFAULT_PLAN_PRICE);
  return [price, store.set];
}
