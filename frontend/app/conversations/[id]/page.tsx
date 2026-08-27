"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { getMessages, type Message } from "@/lib/api";
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

  const refreshMessages = useCallback(async () => {
    setMessages(await getMessages(conversationId));
  }, [conversationId]);

  const { streamingText, isStreaming, error, sendMessage, stop } = useChatStream(
    conversationId,
    refreshMessages,
  );

  useEffect(() => {
    hasSentPending.current = false;
    getMessages(conversationId).then((fetched) => {
      setMessages(fetched);
      setLoadedConversationId(conversationId);
    });
  }, [conversationId]);

  // Adds the just-sent user message immediately, rather than waiting for the whole assistant
  // reply to finish streaming before refreshMessages() would otherwise surface it -- the
  // temporary negative id is only ever seen locally; refreshMessages() replaces the whole list
  // with the authoritative persisted rows (with real ids) once the stream ends.
  function handleSend(content: string) {
    setMessages((prev) => [
      ...prev,
      { id: -Date.now(), conversation_id: conversationId, role: "user", content, created_at: new Date().toISOString() },
    ]);
    sendMessage(content);
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
        <ChatThread messages={messages} streamingText={streamingText} isStreaming={isStreaming} />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
      <ChatComposer isStreaming={isStreaming} onSend={handleSend} onStop={stop} />
    </main>
  );
}
