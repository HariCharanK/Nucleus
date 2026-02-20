import { useState, useEffect, useCallback } from 'react';
import DiffView from './DiffView';

interface DiffData {
  diff: string;
  stat: string;
  untracked?: string;
}

/**
 * DiffPanel — polls /api/diff and renders uncommitted changes.
 * Sits below or beside the chat. Only visible when there are changes.
 */
export default function DiffPanel({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<DiffData | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);

  const fetchDiff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/diff');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        // Auto-expand when there are changes
        if (json.diff?.trim()) {
          setExpanded(true);
        }
      }
    } catch {
      // Silently fail — server might not be running
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and whenever refreshKey changes (after each assistant turn)
  useEffect(() => {
    fetchDiff();
  }, [refreshKey, fetchDiff]);

  // Nothing to show
  if (!data?.diff?.trim()) {
    return null;
  }

  const fileCount = (data.diff.match(/^diff --git/gm) || []).length;

  return (
    <div className="border-t border-neutral-800 bg-neutral-950">
      {/* Header */}
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
        {loading && (
          <span className="ml-auto inline-block w-3 h-3 border border-neutral-600 border-t-emerald-400 rounded-full animate-spin" />
        )}
      </button>

      {/* Diff content */}
      {expanded && (
        <div className="px-4 pb-3 max-h-[40vh] overflow-y-auto">
          <DiffView diff={data.diff} />
        </div>
      )}
    </div>
  );
}
