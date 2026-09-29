import { describe, expect, it, vi } from "vitest";
import { createPlanPriceStore, DEFAULT_PLAN_PRICE, parsePlanPrice, PLAN_STORAGE_KEY, type StorageLike } from "../use-plan-price";

describe("parsePlanPrice", () => {
  it("accepts the three plan tiers", () => {
    expect(parsePlanPrice("20")).toBe(20);
    expect(parsePlanPrice("100")).toBe(100);
    expect(parsePlanPrice("200")).toBe(200);
  });
  it("falls back to the default for anything else", () => {
    for (const bad of [null, undefined, "", "50", "abc", "20.5"]) expect(parsePlanPrice(bad)).toBe(DEFAULT_PLAN_PRICE);
    expect(DEFAULT_PLAN_PRICE).toBe(200);
  });
});

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("createPlanPriceStore", () => {
  it("reads the stored value, defaulting when absent or invalid", () => {
    expect(createPlanPriceStore(() => fakeStorage({ [PLAN_STORAGE_KEY]: "100" })).getSnapshot()).toBe(100);
    expect(createPlanPriceStore(() => fakeStorage()).getSnapshot()).toBe(200);
    expect(createPlanPriceStore(() => fakeStorage({ [PLAN_STORAGE_KEY]: "7" })).getSnapshot()).toBe(200);
  });

  it("persists on set and notifies subscribers until they unsubscribe", () => {
    const st = fakeStorage();
    const store = createPlanPriceStore(() => st);
    const cb = vi.fn();
    const off = store.subscribe(cb);
    store.set(20);
    expect(st.data[PLAN_STORAGE_KEY]).toBe("20");
    expect(store.getSnapshot()).toBe(20);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    store.set(100);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("keeps the choice in memory when storage is blocked", () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    const store = createPlanPriceStore(() => blocked);
    expect(store.getSnapshot()).toBe(200);
    const cb = vi.fn();
    store.subscribe(cb);
    store.set(100);
    expect(store.getSnapshot()).toBe(100);
    expect(cb).toHaveBeenCalled();
  });

  it("works with no storage at all", () => {
    const store = createPlanPriceStore(() => null);
    store.set(20);
    expect(store.getSnapshot()).toBe(20);
  });
});
