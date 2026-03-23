import { useState, useRef, useCallback } from 'react';
import Chat, { type ChatHandle } from './components/Chat';
import Sidebar from './components/Sidebar';

export default function App() {
  const chatRef = useRef<ChatHandle>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  const refreshSidebar = useCallback(() => {
    setSidebarRefreshKey((k) => k + 1);
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    chatRef.current?.loadSession(null);
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    chatRef.current?.loadSession(id);
  }, []);

  const handleSessionChange = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      refreshSidebar();
    },
    [refreshSidebar],
  );

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100">
      {/* Sidebar */}
      <Sidebar
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        refreshKey={sidebarRefreshKey}
      />

      {/* Chat area */}
      <main className="flex-1 flex flex-col min-w-0">
        <Chat ref={chatRef} onSessionChange={handleSessionChange} />
      </main>
    </div>
  );
}
