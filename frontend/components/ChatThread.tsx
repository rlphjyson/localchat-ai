"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/lib/api";
import { MessageBubble } from "@/components/MessageBubble";

interface ChatThreadProps {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
}

export function ChatThread({ messages, streamingText, isStreaming }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Optional chaining on the method itself, not just the ref: jsdom (the test environment)
    // doesn't implement scrollIntoView at all.
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length, streamingText]);

  if (messages.length === 0 && !isStreaming) {
    return <p className="text-sm text-muted-foreground">Ask me anything to get started.</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <MessageBubble key={message.id} role={message.role} content={message.content} />
      ))}
      {isStreaming && <MessageBubble role="assistant" content={streamingText || "..."} />}
      <div ref={bottomRef} />
    </div>
  );
}
