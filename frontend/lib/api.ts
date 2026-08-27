const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options);

  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(body.detail ?? "Request failed", response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function createConversation(model?: string): Promise<Conversation> {
  return request("/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model || null }),
  });
}

export function listConversations(): Promise<Conversation[]> {
  return request("/conversations");
}

export function getMessages(conversationId: string): Promise<Message[]> {
  return request(`/conversations/${conversationId}/messages`);
}

export function deleteConversation(conversationId: string): Promise<void> {
  return request(`/conversations/${conversationId}`, { method: "DELETE" });
}

export function listModels(): Promise<string[]> {
  return request("/models");
}

/** Not run through request() -- the streaming send-message endpoint returns SSE, not JSON, and
 * needs direct access to the Response body's reader (see lib/useChatStream.ts). */
export function buildSendMessageUrl(conversationId: string): string {
  return `${API_BASE_URL}/conversations/${conversationId}/messages`;
}
