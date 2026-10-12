"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Brain, Check, ChevronRight, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CodeBlock({ className, children }: ComponentPropsWithoutRef<"code">) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className ?? "");
  const code = String(children).replace(/\n$/, "");

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!match) {
    return <code className="rounded bg-muted px-1 py-0.5 text-sm">{children}</code>;
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between bg-muted px-3 py-1 text-xs text-muted-foreground">
        <span>{match[1]}</span>
        <button type="button" onClick={handleCopy} className="flex items-center gap-1 hover:text-foreground">
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter language={match[1]} style={oneDark} customStyle={{ margin: 0 }}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// Tailwind's preflight reset strips default browser styling from headings/lists (no bullet or
// number markers, headings the same size as body text) -- without this, react-markdown's output
// for anything beyond plain paragraphs/bold/code was rendering as visually flat, unstructured
// text (a real gap caught by actually looking at a live screenshot, not just the unit tests,
// which only assert text content, not layout/marker visibility).
const MARKDOWN_COMPONENTS = {
  code: CodeBlock,
  p: (props: ComponentPropsWithoutRef<"p">) => <p className="mb-2 last:mb-0" {...props} />,
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="mb-2 list-disc space-y-1 pl-5" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5" {...props} />
  ),
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mt-3 mb-1 text-sm font-semibold first:mt-0" {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="underline underline-offset-2 hover:text-foreground" {...props} />
  ),
};

/** Expanded while the model is still reasoning, then collapses as soon as the reply starts --
 * `open` only changes the DOM when the prop itself flips, so the user can still toggle it freely
 * afterwards. */
function ReasoningBlock({ thinking, isThinking }: { thinking: string; isThinking: boolean }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Follow the live reasoning, which otherwise grows out of view below the capped height.
    if (isThinking && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thinking, isThinking]);

  return (
    <details open={isThinking} className="group mb-2 rounded-md border bg-background/50 text-xs last:mb-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
        <Brain className="size-3.5" />
        {isThinking ? <span className="animate-pulse">Thinking...</span> : "Reasoning"}
      </summary>
      <div
        ref={bodyRef}
        className="max-h-72 overflow-y-auto border-t px-3 py-2 whitespace-pre-wrap text-muted-foreground"
      >
        {thinking}
      </div>
    </details>
  );
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  /** True while reasoning is still streaming in, before any of the reply itself. */
  isThinking?: boolean;
}

export function MessageBubble({ role, content, thinking = "", isThinking = false }: MessageBubbleProps) {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "max-w-2xl rounded-lg p-3 text-sm [&_p]:whitespace-pre-wrap",
        isUser ? "ml-auto bg-primary/10" : "bg-muted/60",
      )}
    >
      {thinking && <ReasoningBlock thinking={thinking} isThinking={isThinking} />}
      {content && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
          {content}
        </ReactMarkdown>
      )}
    </div>
  );
}
