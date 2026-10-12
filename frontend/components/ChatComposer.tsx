"use client";

import { useState, type FormEvent } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EffortSelect } from "@/components/EffortSelect";
import type { Effort } from "@/lib/effort";

interface ChatComposerProps {
  isStreaming: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
  /** Both omitted for a model without reasoning support, which hides the effort picker. */
  effort?: Effort;
  onEffortChange?: (effort: Effort) => void;
}

export function ChatComposer({
  isStreaming,
  onSend,
  onStop,
  effort,
  onEffortChange,
}: ChatComposerProps) {
  const [content, setContent] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() || isStreaming) return;
    onSend(content);
    setContent("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-end gap-2">
        <textarea
          autoFocus
          rows={2}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Message LocalChat..."
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        {isStreaming ? (
          <Button type="button" variant="outline" onClick={onStop}>
            <Square className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!content.trim()} aria-label="Send">
            <Send />
          </Button>
        )}
      </div>
      {effort && onEffortChange && <EffortSelect value={effort} onChange={onEffortChange} />}
    </form>
  );
}
