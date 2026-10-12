import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same isolation approach as theme.test.ts: effortStore reads localStorage only once per module
// instance, so each test gets a freshly imported one.
async function freshEffortStore(): Promise<typeof import("./effort").effortStore> {
  vi.resetModules();
  const mod = await import("./effort");
  return mod.effortStore;
}

describe("effortStore", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("defaults to low when nothing is stored", async () => {
    const effortStore = await freshEffortStore();
    expect(effortStore.getSnapshot()).toBe("low");
  });

  it("persists a new choice and notifies subscribers", async () => {
    const effortStore = await freshEffortStore();
    const listener = vi.fn();
    effortStore.subscribe(listener);

    effortStore.set("high");

    expect(effortStore.getSnapshot()).toBe("high");
    expect(window.localStorage.getItem("localchat_effort")).toBe("high");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("restores a stored choice", async () => {
    window.localStorage.setItem("localchat_effort", "off");
    const effortStore = await freshEffortStore();
    expect(effortStore.getSnapshot()).toBe("off");
  });

  it("ignores an unrecognized stored value", async () => {
    window.localStorage.setItem("localchat_effort", "extreme");
    const effortStore = await freshEffortStore();
    expect(effortStore.getSnapshot()).toBe("low");
  });
});
