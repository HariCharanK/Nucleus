import { useRef } from 'react';
import Chat, { type ChatHandle } from './components/Chat';

export default function App() {
  const chatRef = useRef<ChatHandle>(null);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="flex items-center gap-2 px-5 py-3 border-b border-neutral-800 shrink-0">
        <span className="text-lg">🧬</span>
        <h1 className="text-sm font-semibold tracking-wide text-emerald-400">
          Nucleus
        </h1>
        <span className="text-xs text-neutral-600 ml-1">
          thought router
        </span>
        <button
          onClick={() => chatRef.current?.newChat()}
          className="ml-auto text-xs text-neutral-500 hover:text-neutral-300 border border-neutral-800 hover:border-neutral-600 rounded px-2.5 py-1 transition-colors"
        >
          + New Chat
        </button>
      </header>

      {/* Chat area */}
      <main className="flex-1 min-h-0">
        <Chat ref={chatRef} />
      </main>
    </div>
  );
}
