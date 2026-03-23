import { useState, useEffect, useCallback } from 'react';

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SidebarProps {
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  /** Incremented externally to trigger a refresh. */
  refreshKey: number;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr + 'Z'); // SQLite stores UTC without Z
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Sidebar({
  activeSessionId,
  onSelectSession,
  onNewChat,
  refreshKey,
}: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, refreshKey]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        onNewChat();
      }
    } catch {
      // Silently fail
    }
  };

  return (
    <aside className="w-64 flex flex-col bg-neutral-950 border-r border-neutral-800 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800 shrink-0">
        <span className="text-lg">🧬</span>
        <h1 className="text-sm font-semibold tracking-wide text-emerald-400">
          Nucleus
        </h1>
      </div>

      {/* New Chat button */}
      <div className="px-3 py-2 shrink-0">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-600 rounded-lg transition-colors"
        >
          <span className="text-base leading-none">+</span>
          New Chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {sessions.length === 0 && (
          <p className="text-xs text-neutral-600 px-2 py-4 text-center">
            No conversations yet
          </p>
        )}

        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`w-full text-left rounded-lg px-3 py-2 mb-0.5 group transition-colors relative ${
                isActive
                  ? 'bg-neutral-800/80 text-neutral-100'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <div className="text-sm truncate pr-6">{session.title}</div>
              <div className="text-[11px] text-neutral-600 mt-0.5">
                {formatTime(session.updated_at)}
              </div>

              {/* Delete button */}
              {(hoveredId === session.id || isActive) && (
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-red-400 p-1 transition-colors"
                  title="Delete conversation"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
