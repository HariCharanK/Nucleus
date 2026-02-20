import { useState } from 'react';

interface DiffFile {
  header: string;
  filePath: string;
  hunks: DiffHunk[];
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'no-newline';
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Find next "diff --git" line
    if (!lines[i].startsWith('diff --git')) {
      i++;
      continue;
    }

    const header = lines[i];
    // Extract file path: prefer +++ b/... line, fall back to header parsing
    let filePath = '';
    const headerMatch = header.match(/diff --git a\/(.+?) b\/(.+)/);
    if (headerMatch) {
      filePath = headerMatch[2];
    }
    i++;

    // Skip metadata lines (old mode, new mode, index, similarity, rename, etc.)
    while (
      i < lines.length &&
      !lines[i].startsWith('diff --git') &&
      !lines[i].startsWith('@@') &&
      !lines[i].startsWith('--- ') &&
      !lines[i].startsWith('+++ ') &&
      // Also skip "Binary files" lines
      !lines[i].startsWith('Binary ')
    ) {
      i++;
    }

    // --- a/... and +++ b/... lines
    if (i < lines.length && lines[i].startsWith('--- ')) {
      i++;
    }
    if (i < lines.length && lines[i].startsWith('+++ ')) {
      const plusMatch = lines[i].match(/^\+\+\+ b\/(.+)/);
      if (plusMatch) {
        filePath = plusMatch[1];
      }
      i++;
    }

    const hunks: DiffHunk[] = [];

    // Parse hunks
    while (i < lines.length && !lines[i].startsWith('diff --git')) {
      if (lines[i].startsWith('@@')) {
        const hunkHeader = lines[i];
        const rangeMatch = hunkHeader.match(
          /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/
        );
        let oldLine = rangeMatch ? parseInt(rangeMatch[1], 10) : 1;
        let newLine = rangeMatch ? parseInt(rangeMatch[2], 10) : 1;
        i++;

        const hunkLines: DiffLine[] = [];

        while (
          i < lines.length &&
          !lines[i].startsWith('@@') &&
          !lines[i].startsWith('diff --git')
        ) {
          const line = lines[i];

          if (line.startsWith('+')) {
            hunkLines.push({
              type: 'add',
              content: line.slice(1),
              oldLineNo: null,
              newLineNo: newLine++,
            });
          } else if (line.startsWith('-')) {
            hunkLines.push({
              type: 'remove',
              content: line.slice(1),
              oldLineNo: oldLine++,
              newLineNo: null,
            });
          } else if (line.startsWith('\\ No newline')) {
            hunkLines.push({
              type: 'no-newline',
              content: line,
              oldLineNo: null,
              newLineNo: null,
            });
          } else {
            // Context line (starts with space or is empty)
            hunkLines.push({
              type: 'context',
              content: line.startsWith(' ') ? line.slice(1) : line,
              oldLineNo: oldLine++,
              newLineNo: newLine++,
            });
          }
          i++;
        }

        hunks.push({ header: hunkHeader, lines: hunkLines });
      } else {
        i++;
      }
    }

    if (filePath) {
      files.push({ header, filePath, hunks });
    }
  }

  return files;
}

export default function DiffView({ diff }: { diff: string }) {
  const files = parseDiff(diff);

  if (files.length === 0) {
    return (
      <pre className="font-mono text-xs text-neutral-400 whitespace-pre-wrap">
        {diff}
      </pre>
    );
  }

  return (
    <div className="space-y-3">
      {files.map((file, fi) => (
        <DiffFileView key={fi} file={file} />
      ))}
    </div>
  );
}

function DiffFileView({ file }: { file: DiffFile }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-md border border-neutral-800 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-neutral-900 text-left text-xs font-mono text-neutral-300 hover:bg-neutral-800 transition-colors"
      >
        <span className="text-neutral-500">{expanded ? '▾' : '▸'}</span>
        <span className="text-emerald-400">{file.filePath}</span>
      </button>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <tbody>
              {file.hunks.map((hunk, hi) => (
                <HunkView key={hi} hunk={hunk} isFirst={hi === 0} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HunkView({ hunk, isFirst }: { hunk: DiffHunk; isFirst: boolean }) {
  return (
    <>
      {/* Hunk header */}
      <tr className={!isFirst ? 'border-t border-neutral-800' : undefined}>
        <td
          colSpan={3}
          className="px-3 py-1 text-neutral-500 bg-neutral-900/50 text-xs"
        >
          {hunk.header}
        </td>
      </tr>

      {hunk.lines.map((line, li) => {
        if (line.type === 'no-newline') {
          return (
            <tr key={li}>
              <td colSpan={3} className="px-3 text-neutral-600 text-xs italic">
                {line.content}
              </td>
            </tr>
          );
        }

        const bgClass =
          line.type === 'add'
            ? 'bg-green-950/50'
            : line.type === 'remove'
              ? 'bg-red-950/50'
              : '';

        const textClass =
          line.type === 'add'
            ? 'text-green-300'
            : line.type === 'remove'
              ? 'text-red-300'
              : 'text-neutral-400';

        const prefix =
          line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

        return (
          <tr key={li} className={bgClass}>
            <td className="w-10 text-right pr-1 text-neutral-600 select-none border-r border-neutral-800/50 leading-5">
              {line.oldLineNo ?? ''}
            </td>
            <td className="w-10 text-right pr-1 text-neutral-600 select-none border-r border-neutral-800/50 leading-5">
              {line.newLineNo ?? ''}
            </td>
            <td className={`pl-2 pr-3 whitespace-pre leading-5 ${textClass}`}>
              {prefix}
              {line.content}
            </td>
          </tr>
        );
      })}
    </>
  );
}
