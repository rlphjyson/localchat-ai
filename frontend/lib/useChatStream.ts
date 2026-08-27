"use client";

import { useCallback, useRef, useState } from "react";
import { ApiError, buildSendMessageUrl } from "@/lib/api";

interface UseChatStreamResult {
  streamingText: string;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  stop: () => void;
}

interface SseFrame {
  event: string;
  data: { text?: string; message?: string; tokens_per_second?: number | null };
}

/** Parses one SSE frame ("event: X\ndata: Y") into its event name + parsed JSON payload -- a
 * browser's native EventSource can't be used here since it doesn't support POST bodies, so the
 * stream is read and framed by hand off a plain fetch() response body reader instead. */
function parseSseFrame(frame: string): SseFrame | null {
  const eventLine = frame.split("\n").find((line) => line.startsWith("event: "));
  const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
  if (!eventLine || !dataLine) return null;
  return {
    event: eventLine.slice("event: ".length),
    data: JSON.parse(dataLine.slice("data: ".length)),
  };
}

/** Streams one assistant reply token-by-token from POST /conversations/{id}/messages. `onDone`
 * is called once the stream ends (success, error, or a client-side Stop) so the caller can
 * re-fetch the authoritative persisted messages -- the backend persists the complete (or
 * partial, if stopped) assistant reply itself once its own generator finishes. */
export function useChatStream(conversationId: string, onDone: () => void): UseChatStreamResult {
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      setError(null);
      setStreamingText("");
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(buildSendMessageUrl(conversationId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new ApiError("Failed to send message", response.status);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const frame = parseSseFrame(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            if (frame?.event === "token" && frame.data.text) {
              setStreamingText((prev) => prev + frame.data.text);
            } else if (frame?.event === "error" && frame.data.message) {
              setError(frame.data.message);
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // The user hit Stop -- not an error, the backend already persists whatever was
          // generated so far once it notices the client disconnected.
        } else {
          setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        onDone();
      }
    },
    [conversationId, onDone],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { streamingText, isStreaming, error, sendMessage, stop };
}
