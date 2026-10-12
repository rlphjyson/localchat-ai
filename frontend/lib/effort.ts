"use client";

import { useSyncExternalStore } from "react";

const EFFORT_STORAGE_KEY = "localchat_effort";

/** How much a reasoning-capable model thinks before answering -- sent as the send-message
 * request's `effort`, which the backend passes to Ollama's `think`. */
export type Effort = "off" | "low" | "medium" | "high";

export const EFFORT_LEVELS: { value: Effort; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

// Low rather than Off: reasoning is the point of picking a thinking model, and Low is the
// cheapest level of it -- on a partly CPU-offloaded 27B model even that adds ~30-60s per reply.
const DEFAULT_EFFORT: Effort = "low";

type Listener = () => void;

let effort: Effort = DEFAULT_EFFORT;
let initialized = false;
let listeners: Listener[] = [];

function isEffort(value: unknown): value is Effort {
  return EFFORT_LEVELS.some((level) => level.value === value);
}

function ensureInitialized() {
  if (initialized) return;
  try {
    const stored = window.localStorage.getItem(EFFORT_STORAGE_KEY);
    if (isEffort(stored)) effort = stored;
  } catch {
    // Storage blocked (private window, disabled site data) -- the default applies this session.
  }
  initialized = true;
}

function notify() {
  for (const listener of listeners) listener();
}

/** The user's last-picked effort, remembered across conversations -- same external-store
 * pattern as lib/theme.ts, so the new-chat page and an open conversation stay in sync. */
export const effortStore = {
  getSnapshot(): Effort {
    ensureInitialized();
    return effort;
  },
  getServerSnapshot(): Effort {
    return DEFAULT_EFFORT;
  },
  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
  set(value: Effort): void {
    effort = value;
    initialized = true;
    try {
      window.localStorage.setItem(EFFORT_STORAGE_KEY, value);
    } catch {
      // Not persisted, but still applies for the rest of this session.
    }
    notify();
  },
};

export function useEffort(): [Effort, (value: Effort) => void] {
  const current = useSyncExternalStore(
    effortStore.subscribe,
    effortStore.getSnapshot,
    effortStore.getServerSnapshot,
  );
  return [current, effortStore.set];
}
