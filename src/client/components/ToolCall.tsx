import { useState } from 'react';
import DiffView from './DiffView';

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: 'call' | 'partial-call' | 'result';
  result?: unknown;
}

function looksLikeDiff(text: string): boolean {
  return (
    text.includes('diff --git') ||
    /^@@\s+-\d+/.test(text) ||
    text.includes('\n@@ ')
  );
}

function formatResult(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-neutral-600 border-t-emerald-400 rounded-full animate-spin" />
  );
}

export default function ToolCall({
  toolInvocation,
}: {
  toolInvocation: ToolInvocation;
}) {
  const isComplete = toolInvocation.state === 'result';
  const [expanded, setExpanded] = useState(!isComplete);

  const { toolName, args } = toolInvocation;
  const resultText = formatResult(toolInvocation.result);

  // Derive a short summary for the collapsed header
  let summary = toolName;
  if (toolName === 'bash' && typeof args.command === 'string') {
    const cmd = args.command;
    summary = cmd.length > 80 ? cmd.slice(0, 77) + '…' : cmd;
  } else if (
    toolName === 'str_replace_based_edit_tool' ||
    toolName === 'text_editor'
  ) {
    const command = (args.command as string) || 'edit';
    const path = (args.path as string) || '';
    summary = `${command} ${path}`;
  }

  return (
    <div className="my-1.5 rounded-md border border-neutral-800 bg-neutral-900/60 overflow-hidden text-xs">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-800/50 transition-colors"
      >
        <span className="text-neutral-500 text-[10px]">
          {expanded ? '▾' : '▸'}
        </span>

        {!isComplete && <Spinner />}

        <span className="text-emerald-500 font-mono shrink-0">
          {toolName === 'bash'
            ? '$'
            : toolName === 'str_replace_based_edit_tool' ||
                toolName === 'text_editor'
              ? '✎'
              : '⚡'}
        </span>

        <span className="font-mono text-neutral-300 truncate">{summary}</span>

        {isComplete && (
          <span className="ml-auto text-neutral-600 shrink-0">
            {resultText.length > 0
              ? `${resultText.split('\n').length} lines`
              : 'done'}
          </span>
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-neutral-800">
          {/* Args / command detail */}
          {toolName === 'bash' && typeof args.command === 'string' && (
            <div className="px-3 py-2 bg-neutral-950/50">
              <pre className="font-mono text-neutral-300 whitespace-pre-wrap break-all">
                {args.command}
              </pre>
            </div>
          )}

          {(toolName === 'str_replace_based_edit_tool' ||
            toolName === 'text_editor') && (
            <div className="px-3 py-2 bg-neutral-950/50 space-y-1">
              <div className="text-neutral-500">
                <span className="text-neutral-400">
                  {(args.command as string) || 'edit'}
                </span>{' '}
                <span className="text-emerald-400 font-mono">
                  {(args.path as string) || ''}
                </span>
              </div>
              {args.file_text != null && (
                <details className="text-neutral-400">
                  <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300 text-[11px]">
                    file content
                  </summary>
                  <pre className="mt-1 font-mono text-[11px] text-neutral-400 whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {String(args.file_text)}
                  </pre>
                </details>
              )}
              {args.old_str != null && (
                <div className="font-mono text-red-400/70 text-[11px]">
                  <span className="text-neutral-500">-</span>{' '}
                  {String(args.old_str)}
                </div>
              )}
              {args.new_str != null && (
                <div className="font-mono text-green-400/70 text-[11px]">
                  <span className="text-neutral-500">+</span>{' '}
                  {String(args.new_str)}
                </div>
              )}
            </div>
          )}

          {/* Generic tool args for other tools */}
          {toolName !== 'bash' &&
            toolName !== 'str_replace_based_edit_tool' &&
            toolName !== 'text_editor' && (
              <div className="px-3 py-2 bg-neutral-950/50">
                <pre className="font-mono text-neutral-400 whitespace-pre-wrap text-[11px]">
                  {JSON.stringify(args, null, 2)}
                </pre>
              </div>
            )}

          {/* Result */}
          {isComplete && resultText.length > 0 && (
            <div className="border-t border-neutral-800">
              {looksLikeDiff(resultText) ? (
                <div className="p-2">
                  <DiffView diff={resultText} />
                </div>
              ) : (
                <div className="px-3 py-2 max-h-80 overflow-y-auto">
                  <pre className="font-mono text-neutral-400 whitespace-pre-wrap text-[11px] leading-4">
                    {resultText}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Loading state for result */}
          {!isComplete && (
            <div className="px-3 py-2 border-t border-neutral-800 text-neutral-500 flex items-center gap-2">
              <Spinner />
              <span>Running…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
