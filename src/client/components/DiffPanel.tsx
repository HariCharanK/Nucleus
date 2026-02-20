import { useState, useEffect, useCallback, useRef } from 'react';
import DiffView from './DiffView';

interface DiffData {
  diff: string;
  stat: string;
  untracked?: string;
}

/**
 * DiffPanel — shows uncommitted git changes from the notes dir.
 * Polls every 2s while the agent is streaming, fetches once when idle.
 */
export default function DiffPanel({ isStreaming }: { isStreaming: boolean }) {
  const [data, setData] = useState<DiffData | null>(null);
  const [expanded, setExpanded] = useState(true);
  const prevDiffRef = useRef<string>('');

  const fetchDiff = useCallback(async () => {
    try {
      const res = await fetch('/api/diff');
      if (res.ok) {
        const json = await res.json();
        // Only update state if diff actually changed (avoid unnecessary re-renders)
        if (json.diff !== prevDiffRef.current) {
          prevDiffRef.current = json.diff ?? '';
          setData(json);
          if (json.diff?.trim()) {
            setExpanded(true);
          }
        }
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    // Always fetch immediately
    fetchDiff();

    if (isStreaming) {
      // Poll every 2s while the agent is working
      const interval = setInterval(fetchDiff, 2000);
      return () => clearInterval(interval);
    }
  }, [isStreaming, fetchDiff]);

  if (!data?.diff?.trim()) {
    return null;
  }

  const fileCount = (data.diff.match(/^diff --git/gm) || []).length;

  return (
    <div className="border-t border-neutral-800 bg-neutral-950">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-neutral-900 transition-colors"
      >
        <span className="text-neutral-500">{expanded ? '▾' : '▸'}</span>
        <span className="text-emerald-400 font-medium">
          Uncommitted Changes
        </span>
        <span className="text-neutral-600">
          {fileCount} file{fileCount !== 1 ? 's' : ''}
        </span>
        {isStreaming && (
          <span className="ml-auto inline-block w-3 h-3 border border-neutral-600 border-t-emerald-400 rounded-full animate-spin" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 max-h-[40vh] overflow-y-auto">
          <DiffView diff={data.diff} />
        </div>
      )}
    </div>
  );
}
