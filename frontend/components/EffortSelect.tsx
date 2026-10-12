"use client";

import { Brain } from "lucide-react";
import { EFFORT_LEVELS, type Effort } from "@/lib/effort";

interface EffortSelectProps {
  value: Effort;
  onChange: (value: Effort) => void;
}

export function EffortSelect({ value, onChange }: EffortSelectProps) {
  return (
    <label
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title="How much the model reasons before answering -- higher is slower but more careful."
    >
      <Brain className="size-3.5" />
      Reasoning
      <select
        aria-label="Reasoning effort"
        value={value}
        onChange={(event) => onChange(event.target.value as Effort)}
        className="rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground"
      >
        {EFFORT_LEVELS.map((level) => (
          <option key={level.value} value={level.value}>
            {level.label}
          </option>
        ))}
      </select>
    </label>
  );
}
