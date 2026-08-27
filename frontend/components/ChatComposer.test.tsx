import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatComposer } from "./ChatComposer";

describe("ChatComposer", () => {
  it("shows a Send button when idle, calls onSend with the typed content", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer isStreaming={false} onSend={onSend} onStop={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/message localchat/i), "hello");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("clears the input after sending", async () => {
    const user = userEvent.setup();
    render(<ChatComposer isStreaming={false} onSend={vi.fn()} onStop={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/message localchat/i) as HTMLTextAreaElement;

    await user.type(textarea, "hello");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(textarea.value).toBe("");
  });

  it("disables the send button when the input is empty", () => {
    const onSend = vi.fn();
    render(<ChatComposer isStreaming={false} onSend={onSend} onStop={vi.fn()} />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows a Stop button while streaming, not the send button", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer isStreaming={true} onSend={vi.fn()} onStop={onStop} />);

    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /stop/i }));
    expect(onStop).toHaveBeenCalled();
  });

  it("sends on Enter without shift, not on shift+Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer isStreaming={false} onSend={onSend} onStop={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/message localchat/i);

    await user.type(textarea, "line one{Shift>}{Enter}{/Shift}line two");
    expect(onSend).not.toHaveBeenCalled();

    await user.type(textarea, "{Enter}");
    expect(onSend).toHaveBeenCalledWith("line one\nline two");
  });
});
