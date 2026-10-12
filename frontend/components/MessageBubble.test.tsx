import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("renders plain text content", () => {
    render(<MessageBubble role="user" content="hello world" />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("renders a fenced code block with a language label and a copy button", () => {
    render(<MessageBubble role="assistant" content={"```python\nprint(1)\n```"} />);
    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("renders inline code without a language label or copy button", () => {
    render(<MessageBubble role="assistant" content="Use `foo()` here." />);
    expect(screen.getByText("foo()")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
  });

  it("shows no reasoning block for a reply without reasoning", () => {
    render(<MessageBubble role="assistant" content="hi" />);
    expect(screen.queryByText("Reasoning")).not.toBeInTheDocument();
  });

  it("expands live reasoning while thinking, then collapses it once the reply starts", () => {
    const { rerender } = render(
      <MessageBubble role="assistant" content="" thinking="Working it out" isThinking={true} />,
    );
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
    expect(screen.getByText("Working it out").closest("details")).toHaveAttribute("open");

    rerender(<MessageBubble role="assistant" content="Done" thinking="Working it out" isThinking={false} />);
    expect(screen.getByText("Reasoning")).toBeInTheDocument();
    expect(screen.getByText("Working it out").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});

