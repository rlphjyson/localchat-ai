"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { getConversation, getMessages, listModels, type Message } from "@/lib/api";
import { useEffort } from "@/lib/effort";
import { useChatStream } from "@/lib/useChatStream";
import { ChatThread } from "@/components/ChatThread";
import { ChatComposer } from "@/components/ChatComposer";
import { pendingMessageKey } from "@/app/conversations/page";

export default function ConversationPage({ params }: PageProps<"/conversations/[id]">) {
  const { id: conversationId } = use(params);
  const [messages, setMessages] = useState<Message[]>([]);
  // Derived from whether the last *completed* fetch's conversationId matches the current one,
  // rather than a separately-reset boolean -- avoids a synchronous setState(false) at the top of
  // the effect below (React 19's react-hooks/set-state-in-effect flags that as cascading-render-
  // prone), and "not yet loaded for this id" falls out naturally the instant conversationId
  // changes, before the new fetch even resolves.
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const loaded = loadedConversationId === conversationId;
  const hasSentPending = useRef(false);
  const [supportsThinking, setSupportsThinking] = useState(false);
  const [effort, setEffort] = useEffort();

  const refreshMessages = useCallback(async () => {
    setMessages(await getMessages(conversationId));
  }, [conversationId]);

  const { streamingText, streamingThinking, isStreaming, error, sendMessage, stop } =
    useChatStream(conversationId, refreshMessages);

  useEffect(() => {
    hasSentPending.current = false;
    // A superseded run's results are dropped: in dev, Strict Mode runs this effect twice, and the
    // first run resolving lets the pending first message below be sent -- the second run's
    // pre-send message list then landed afterwards, wiping the just-added user message from view
    // until the whole reply finished streaming.
    let cancelled = false;
    // Model capabilities load alongside the messages, not after them -- the pending first message
    // below is sent the moment `loaded` flips, and needs to know whether to send an effort.
    // Ollama being unreachable just means no effort picker, not a page that never loads.
    Promise.all([
      getMessages(conversationId),
      getConversation(conversationId),
      listModels().catch(() => []),
    ]).then(([fetched, conversation, models]) => {
      if (cancelled) return;
      setMessages(fetched);
      setSupportsThinking(
        models.some((model) => model.name === conversation.model && model.supports_thinking),
      );
      setLoadedConversationId(conversationId);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Adds the just-sent user message immediately, rather than waiting for the whole assistant
  // reply to finish streaming before refreshMessages() would otherwise surface it -- the
  // temporary negative id is only ever seen locally; refreshMessages() replaces the whole list
  // with the authoritative persisted rows (with real ids) once the stream ends.
  function handleSend(content: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: -Date.now(),
        conversation_id: conversationId,
        role: "user",
        content,
        thinking: "",
        created_at: new Date().toISOString(),
      },
    ]);
    sendMessage(content, supportsThinking ? effort : "off");
  }

  useEffect(() => {
    if (!loaded || hasSentPending.current) return;
    const key = pendingMessageKey(conversationId);
    const pending = sessionStorage.getItem(key);
    if (!pending) return;
    hasSentPending.current = true;
    sessionStorage.removeItem(key);
    // Deferred to a microtask rather than called synchronously here: handleSend's setState
    // calls, run directly in an effect body, are exactly what react-hooks/set-state-in-effect
    // flags as cascading-render-prone -- same class of fix as the reset above.
    Promise.resolve().then(() => handleSend(pending));
    // handleSend intentionally omitted -- it's redefined every render (not itself memoized), and
    // depending on it would re-run this effect on every render instead of just id/loaded changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, conversationId]);

  if (!loaded) return null;

  return (
    <main className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 px-6 py-8">
      <div className="flex-1 overflow-y-auto">
        <ChatThread
          messages={messages}
          streamingText={streamingText}
          streamingThinking={streamingThinking}
          isStreaming={isStreaming}
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
      <ChatComposer
        isStreaming={isStreaming}
        onSend={handleSend}
        onStop={stop}
        effort={supportsThinking ? effort : undefined}
        onEffortChange={supportsThinking ? setEffort : undefined}
      />
    </main>
  );
}
