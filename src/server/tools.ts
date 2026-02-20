import { execSync } from 'child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  readdirSync,
} from 'fs';
import { resolve, dirname, join } from 'path';
import { tool } from 'ai';
import { z } from 'zod';

const MAX_OUTPUT_CHARS = 10_000;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return (
    text.slice(0, MAX_OUTPUT_CHARS) +
    `\n\n... [truncated — ${text.length - MAX_OUTPUT_CHARS} chars omitted]`
  );
}

/**
 * Resolve a path relative to notesDir, preventing path traversal.
 */
function safePath(notesDir: string, filePath: string): string {
  const resolved = resolve(notesDir, filePath);
  if (!resolved.startsWith(resolve(notesDir))) {
    throw new Error(`Path traversal blocked: ${filePath}`);
  }
  return resolved;
}

/**
 * Build the bash tool — executes shell commands scoped to NOTES_DIR.
 */
export function createBashTool(notesDir: string) {
  return tool({
    description:
      'Execute a shell command. The working directory is always the notes directory. ' +
      'Use for git operations, listing files, searching content, etc.',
    parameters: z.object({
      command: z.string().describe('The shell command to execute'),
    }),
    execute: async ({ command }) => {
      try {
        const stdout = execSync(command, {
          cwd: notesDir,
          timeout: 30_000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 1024 * 1024,
        });
        return truncate(stdout || '(no output)');
      } catch (err: unknown) {
        const execErr = err as {
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        const output = [execErr.stdout, execErr.stderr]
          .filter(Boolean)
          .join('\n');
        return truncate(output || execErr.message || 'Command failed');
      }
    },
  });
}

/**
 * Add line numbers to file content for display.
 */
function addLineNumbers(content: string, startLine: number = 1): string {
  const lines = content.split('\n');
  const width = String(startLine + lines.length - 1).length;
  return lines
    .map((line, i) => `${String(startLine + i).padStart(width, ' ')}\t${line}`)
    .join('\n');
}

/**
 * List directory contents in a tree-like format.
 */
function listDirectory(dirPath: string, prefix: string = ''): string {
  const entries = readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.git') && e.name !== 'node_modules')
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const lines: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';
    const suffix = entry.isDirectory() ? '/' : '';
    lines.push(`${prefix}${connector}${entry.name}${suffix}`);
    if (entry.isDirectory()) {
      const subPath = join(dirPath, entry.name);
      const subtree = listDirectory(subPath, prefix + childPrefix);
      if (subtree) lines.push(subtree);
    }
  }
  return lines.join('\n');
}

/**
 * Build the text editor tool as a standard tool().
 *
 * Defined as a regular Vercel AI SDK tool instead of using the native
 * Anthropic provider tool — avoids SDK/API version mismatches on the
 * tool name (text_editor_20250124 vs str_replace_editor).
 *
 * Supports: view (file or directory), create, str_replace, insert.
 */
export function createTextEditorTool(notesDir: string) {
  return tool({
    description:
      'A text editor for viewing and editing files in the notes directory. ' +
      'Commands: view (display file with line numbers, or list directory), ' +
      'create (create or overwrite a file), ' +
      'str_replace (find and replace exact text — must be unique), ' +
      'insert (insert text after a specific line number). ' +
      'All paths are relative to the notes root.',
    parameters: z.object({
      command: z
        .enum(['view', 'create', 'str_replace', 'insert'])
        .describe('The operation to perform'),
      path: z
        .string()
        .describe('Path to the file or directory, relative to notes root'),
      file_text: z
        .string()
        .optional()
        .describe('File content for create command'),
      old_str: z
        .string()
        .optional()
        .describe('Exact string to find for str_replace (must be unique)'),
      new_str: z
        .string()
        .optional()
        .describe('Replacement string for str_replace, or text to insert'),
      view_range: z
        .array(z.number())
        .optional()
        .describe(
          'Optional [start, end] 1-indexed line range for view command',
        ),
      insert_line: z
        .number()
        .optional()
        .describe(
          'Line number after which to insert text (0 = beginning of file)',
        ),
    }),
    execute: async ({ command, path: filePath, file_text, old_str, new_str, view_range, insert_line }) => {
      try {
        switch (command) {
          case 'view': {
            const fullPath = safePath(notesDir, filePath);

            if (!existsSync(fullPath)) {
              return `Error: Path does not exist: ${filePath}`;
            }

            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              const tree = listDirectory(fullPath);
              return `Directory listing of ${filePath}:\n${tree}`;
            }

            const content = readFileSync(fullPath, 'utf-8');
            if (view_range) {
              const [start, end] = view_range;
              const lines = content.split('\n');
              const slice = lines.slice(start - 1, end);
              return addLineNumbers(slice.join('\n'), start);
            }
            return addLineNumbers(content);
          }

          case 'create': {
            const fullPath = safePath(notesDir, filePath);
            mkdirSync(dirname(fullPath), { recursive: true });
            writeFileSync(fullPath, file_text ?? '', 'utf-8');
            return `File created: ${filePath}`;
          }

          case 'str_replace': {
            const fullPath = safePath(notesDir, filePath);

            if (!existsSync(fullPath)) {
              return `Error: File does not exist: ${filePath}`;
            }

            const content = readFileSync(fullPath, 'utf-8');
            const searchStr = old_str ?? '';
            const replaceStr = new_str ?? '';

            const occurrences = content.split(searchStr).length - 1;
            if (occurrences === 0) {
              return `Error: old_str not found in ${filePath}. Make sure it matches exactly, including whitespace.`;
            }
            if (occurrences > 1) {
              return `Error: old_str found ${occurrences} times in ${filePath}. It must appear exactly once. Include more context to make it unique.`;
            }

            const updated = content.replace(searchStr, replaceStr);
            writeFileSync(fullPath, updated, 'utf-8');
            return `Successfully replaced text in ${filePath}`;
          }

          case 'insert': {
            const fullPath = safePath(notesDir, filePath);

            if (!existsSync(fullPath)) {
              return `Error: File does not exist: ${filePath}`;
            }

            const content = readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            const lineNo = insert_line ?? 0;

            if (lineNo < 0 || lineNo > lines.length) {
              return `Error: insert_line ${lineNo} is out of range (0-${lines.length})`;
            }

            lines.splice(lineNo, 0, new_str ?? '');
            writeFileSync(fullPath, lines.join('\n'), 'utf-8');
            return `Successfully inserted text after line ${lineNo} in ${filePath}`;
          }

          default:
            return `Error: Unknown command: ${command}`;
        }
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}
