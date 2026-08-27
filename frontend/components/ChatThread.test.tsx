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
      { id: 1, conversation_id: "c1", role: "user", content: "hi", created_at: "2026-01-01T00:00:00Z" },
      {
        id: 2,
        conversation_id: "c1",
        role: "assistant",
        content: "hello there",
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
});
