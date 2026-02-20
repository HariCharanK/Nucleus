import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import Message from './Message';
import DiffPanel from './DiffPanel';

export default function Chat() {
  const [error, setError] = useState<string | null>(null);

  const { messages, input, setInput, handleSubmit, status } = useChat({
    api: '/api/chat',
    maxSteps: 20,
    onError: (err) => {
      console.error('[Nucleus] Chat error:', err);
      setError(err.message || 'An unexpected error occurred');
    },
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = status === 'streaming' || status === 'submitted';

  // Clear error when user sends a new message
  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      setError(null);
      handleSubmit(e);
    },
    [handleSubmit],
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
              <div className="text-[11px] text-emerald-500/70 font-medium tracking-wide uppercase flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Thinking…
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

      {/* Diff panel — shows uncommitted changes after agent edits */}
      <DiffPanel isStreaming={isLoading} />

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
            placeholder={isLoading ? 'Waiting for Nucleus…' : 'Message Nucleus…'}
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-100 placeholder-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
}
