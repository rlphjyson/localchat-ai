"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { createConversation, listModels } from "@/lib/api";
import { Button } from "@/components/ui/button";

// A fresh conversation is created empty, then the first message is stashed here (keyed by the
// new conversation's id) so the detail page can send it once mounted -- simpler than threading a
// "create + immediately send" combined request through the streaming endpoint's own contract.
export function pendingMessageKey(conversationId: string): string {
  return `localchat:pending:${conversationId}`;
}

export default function NewConversationPage() {
  const router = useRouter();
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    listModels()
      .then(setModels)
      .catch(() => setModels([]));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || isSubmitting) return;
    setIsSubmitting(true);
    const conversation = await createConversation(selectedModel || undefined);
    sessionStorage.setItem(pendingMessageKey(conversation.id), prompt);
    router.push(`/conversations/${conversation.id}`);
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-xl font-semibold">What can I help with?</h1>
      <form onSubmit={handleSubmit} className="w-full space-y-3">
        {models.length > 0 && (
          <select
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
          >
            <option value="">Default model</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        )}
        <textarea
          autoFocus
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Message LocalChat..."
          className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <Button type="submit" disabled={!prompt.trim() || isSubmitting} className="w-full">
          <Send />
          Start chatting
        </Button>
      </form>
    </main>
  );
}
