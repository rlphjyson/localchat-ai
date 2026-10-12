import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useChatStream } from "./useChatStream";

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

describe("useChatStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("accumulates token events into streamingText and calls onDone when finished", async () => {
    const body = sseStream([
      `event: token\ndata: ${JSON.stringify({ text: "Hel" })}\n\n`,
      `event: token\ndata: ${JSON.stringify({ text: "lo" })}\n\n`,
      `event: done\ndata: ${JSON.stringify({ tokens_per_second: null })}\n\n`,
    ]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const onDone = vi.fn();
    const { result } = renderHook(() => useChatStream("conv-1", onDone));

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.streamingText).toBe("Hello");
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error event without treating it as a thrown exception", async () => {
    const body = sseStream([
      `event: error\ndata: ${JSON.stringify({ message: "Couldn't reach Ollama" })}\n\n`,
    ]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const { result } = renderHook(() => useChatStream("conv-1", vi.fn()));
    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.error).toBe("Couldn't reach Ollama");
    expect(result.current.isStreaming).toBe(false);
  });

  it("treats an aborted fetch (Stop) as a clean stop, not an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      ),
    );

    const { result } = renderHook(() => useChatStream("conv-1", vi.fn()));

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("hi");
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    act(() => {
      result.current.stop();
    });
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });

  it("accumulates thinking events separately from the reply and sends the chosen effort", async () => {
    const body = sseStream([
      `event: thinking\ndata: ${JSON.stringify({ text: "Let me " })}\n\n`,
      `event: thinking\ndata: ${JSON.stringify({ text: "think." })}\n\n`,
      `event: token\ndata: ${JSON.stringify({ text: "42" })}\n\n`,
      `event: done\ndata: ${JSON.stringify({ tokens_per_second: null })}\n\n`,
    ]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChatStream("conv-1", vi.fn()));
    await act(async () => {
      await result.current.sendMessage("hi", "high");
    });

    expect(result.current.streamingThinking).toBe("Let me think.");
    expect(result.current.streamingText).toBe("42");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: "hi", effort: "high" });
  });

  it("sends effort off when none is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(sseStream([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChatStream("conv-1", vi.fn()));
    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).effort).toBe("off");
  });
});
