"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";
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

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "max-w-2xl rounded-lg p-3 text-sm [&_p]:whitespace-pre-wrap",
        isUser ? "ml-auto bg-primary/10" : "bg-muted/60",
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
