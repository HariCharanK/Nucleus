import { useChat } from '@ai-sdk/react';
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  KeyboardEvent,
} from 'react';
import Message from './Message';
import DiffPanel from './DiffPanel';

export interface ChatHandle {
  loadSession: (sessionId: string | null) => void;
}

interface ChatProps {
  onSessionChange: (sessionId: string) => void;
}

const Chat = forwardRef<ChatHandle, ChatProps>(function Chat(
  { onSessionChange },
  ref,
) {
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const { messages, input, setInput, handleSubmit, status, setMessages } =
    useChat({
      api: '/api/chat',
      maxSteps: 20,
      onError: (err) => {
        console.error('[Nucleus] Chat error:', err);
        setError(err.message || 'An unexpected error occurred');
      },
    });

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const isLoading = status === 'streaming' || status === 'submitted';

  // Keep sessionIdRef in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  /** Save current messages to the server (full message objects). */
  const saveMessages = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const msgs = messagesRef.current;
    if (msgs.length === 0) return;

    try {
      await fetch(`/api/sessions/${sid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs }),
      });
    } catch {
      // Best-effort save
    }
  }, []);

  /**
   * Save messages when status transitions to 'ready' (stream finished).
   * This is more reliable than onFinish — React state is guaranteed
   * to be up-to-date when useEffect fires.
   */
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (
      (prev === 'streaming' || prev === 'submitted') &&
      status === 'ready' &&
      sessionIdRef.current
    ) {
      saveMessages();
    }
  }, [status, saveMessages]);

  /** Create a new session on the server, return its ID. */
  const createNewSession = useCallback(async (): Promise<string> => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    return data.id;
  }, []);

  /** Load a session from the server, or reset for a new chat. */
  const loadSession = useCallback(
    async (id: string | null) => {
      setError(null);
      if (!id) {
        setSessionId(null);
        setMessages([]);
        return;
      }

      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (!res.ok) throw new Error('Failed to load session');
        const data = await res.json();
        setSessionId(id);
        setMessages(data.messages ?? []);
      } catch {
        setError('Failed to load conversation');
      }
    },
    [setMessages],
  );

  // Expose loadSession to parent
  useImperativeHandle(ref, () => ({ loadSession }), [loadSession]);

  // Handle submit — create session if needed, then send
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!sessionId) {
        try {
          const newId = await createNewSession();
          setSessionId(newId);
          sessionIdRef.current = newId;
          onSessionChange(newId);
        } catch {
          setError('Failed to create session');
          return;
        }
      }

      handleSubmit(e);
    },
    [handleSubmit, sessionId, createNewSession, onSessionChange],
  );

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, error]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSubmit(e as unknown as React.FormEvent);
      }
    }
  };

  // Notify parent when session gets its first response (for sidebar refresh)
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (
      messages.length > 0 &&
      messages.length !== prevMsgCountRef.current &&
      sessionId
    ) {
      onSessionChange(sessionId);
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, sessionId, onSessionChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.length === 0 && !error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="text-4xl">🧬</div>
              <p className="text-neutral-500 text-sm">
                Start a conversation with Nucleus
              </p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <Message
            key={message.id}
            message={message as Parameters<typeof Message>[0]['message']}
          />
        ))}

        {/* Streaming indicator */}
        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1].role === 'user' && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 py-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-[pulse_1.4s_ease-in-out_infinite]" />
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
              </div>
            </div>
          )}

        {/* Error display */}
        {error && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3">
              <div className="text-[11px] text-red-400 font-medium mb-1 tracking-wide uppercase">
                Error
              </div>
              <div className="text-sm text-red-300 whitespace-pre-wrap">
                {error}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Diff panel — shows uncommitted changes */}
      <div className="pt-2">
        <DiffPanel isStreaming={isLoading} />
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-800 p-4">
        <form
          onSubmit={onSubmit}
          className="flex items-end gap-2 max-w-4xl mx-auto"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isLoading ? 'Type your next message…' : 'Message Nucleus…'
            }
            rows={1}
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-100 placeholder-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-neutral-400 border-t-white rounded-full animate-spin" />
            ) : (
              '↑'
            )}
          </button>
        </form>
      </div>
    </div>
  );
});

export default Chat;
