import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatThread } from "./ChatThread";
import type { Message } from "@/lib/api";

describe("ChatThread", () => {
  it("shows a placeholder when there are no messages and nothing is streaming", () => {
    render(<ChatThread messages={[]} streamingText="" isStreaming={false} />);
    expect(screen.getByText(/ask me anything/i)).toBeInTheDocument();
  });

  it("renders each message in order", () => {
    const messages: Message[] = [
      {
        id: 1,
        conversation_id: "c1",
        role: "user",
        content: "hi",
        thinking: "",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: 2,
        conversation_id: "c1",
        role: "assistant",
        content: "hello there",
        thinking: "",
        created_at: "2026-01-01T00:00:01Z",
      },
    ];
    render(<ChatThread messages={messages} streamingText="" isStreaming={false} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });

  it("renders a live streaming bubble while generating", () => {
    render(<ChatThread messages={[]} streamingText="partial ans" isStreaming={true} />);
    expect(screen.getByText("partial ans")).toBeInTheDocument();
  });

  it("shows live reasoning instead of the placeholder before any reply text arrives", () => {
    render(<ChatThread messages={[]} streamingText="" streamingThinking="Let me see" isStreaming={true} />);
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
    expect(screen.getByText("Let me see")).toBeInTheDocument();
    expect(screen.queryByText("...")).not.toBeInTheDocument();
  });

  it("renders a persisted reply's reasoning collapsed above its content", () => {
    const messages: Message[] = [
      {
        id: 1,
        conversation_id: "c1",
        role: "assistant",
        content: "42",
        thinking: "Six times seven.",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    render(<ChatThread messages={messages} streamingText="" isStreaming={false} />);
    expect(screen.getByText("Reasoning")).toBeInTheDocument();
    expect(screen.getByText("Six times seven.").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
