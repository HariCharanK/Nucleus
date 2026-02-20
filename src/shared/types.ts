/**
 * Shared types between client and server.
 */

/** A chat message in the conversation */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Tool calls made during this assistant turn */
  toolInvocations?: ToolInvocation[];
}

/** A tool invocation (bash or text_editor) */
export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: 'call' | 'result';
  result?: string;
}
