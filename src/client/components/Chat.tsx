import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import Message from './Message';
import DiffPanel from './DiffPanel';

export default function Chat() {
  const { messages, input, setInput, handleSubmit, status } = useChat({
    api: '/api/chat',
    maxSteps: 20,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = status === 'streaming' || status === 'submitted';

  // Track a refresh key that increments when the agent finishes a turn
  const [diffRefreshKey, setDiffRefreshKey] = useState(0);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    // When status transitions from streaming/submitted → ready, the agent is done
    if (
      (prevStatusRef.current === 'streaming' ||
        prevStatusRef.current === 'submitted') &&
      status === 'ready'
    ) {
      // Small delay to let filesystem operations settle
      setTimeout(() => setDiffRefreshKey((k) => k + 1), 500);
    }
    prevStatusRef.current = status;
  }, [status]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
        handleSubmit(e as unknown as React.FormEvent);
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
        {messages.length === 0 && (
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
      </div>

      {/* Diff panel — shows uncommitted changes after agent edits */}
      <DiffPanel refreshKey={diffRefreshKey} />

      {/* Input area */}
      <div className="border-t border-neutral-800 p-4">
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 max-w-4xl mx-auto"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Nucleus…"
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
}
