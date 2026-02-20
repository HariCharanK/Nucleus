import { execSync } from 'child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  readdirSync,
} from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { tool } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
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
      'Execute a shell command. The working directory is always the notes directory. Use for git operations, listing files, searching content, etc.',
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
function addLineNumbers(
  content: string,
  startLine: number = 1,
): string {
  const lines = content.split('\n');
  const width = String(startLine + lines.length - 1).length;
  return lines
    .map(
      (line, i) =>
        `${String(startLine + i).padStart(width, ' ')}\t${line}`,
    )
    .join('\n');
}

/**
 * List directory contents in a tree-like format.
 */
function listDirectory(dirPath: string, prefix: string = ''): string {
  const entries = readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.git') && e.name !== 'node_modules')
    .sort((a, b) => {
      // Directories first, then alphabetical
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
 * Build the text_editor tool using Anthropic's native text editor schema.
 *
 * The Vercel AI SDK's @ai-sdk/anthropic provider exposes the Anthropic text
 * editor tool via `anthropic.tools.textEditor_20250124()`. We pass a custom
 * `execute` function that operates on the local filesystem rooted at notesDir.
 */
export function createTextEditorTool(notesDir: string) {
  const anthropic = createAnthropic();

  return anthropic.tools.textEditor_20250124({
    execute: async (args) => {
      const { command } = args;

      switch (command) {
        case 'view': {
          const filePath = safePath(notesDir, args.path);

          if (!existsSync(filePath)) {
            return `Error: Path does not exist: ${args.path}`;
          }

          const stat = statSync(filePath);
          if (stat.isDirectory()) {
            const tree = listDirectory(filePath);
            return `Directory listing of ${args.path}:\n${tree}`;
          }

          const content = readFileSync(filePath, 'utf-8');
          if (args.view_range) {
            const [start, end] = args.view_range;
            const lines = content.split('\n');
            const slice = lines.slice(start - 1, end);
            return addLineNumbers(slice.join('\n'), start);
          }
          return addLineNumbers(content);
        }

        case 'create': {
          const filePath = safePath(notesDir, args.path);
          mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, args.file_text, 'utf-8');
          return `File created: ${args.path}`;
        }

        case 'str_replace': {
          const filePath = safePath(notesDir, args.path);

          if (!existsSync(filePath)) {
            return `Error: File does not exist: ${args.path}`;
          }

          const content = readFileSync(filePath, 'utf-8');
          const { old_str, new_str } = args;

          const occurrences = content.split(old_str).length - 1;
          if (occurrences === 0) {
            return `Error: old_str not found in ${args.path}. Make sure the string matches exactly, including whitespace.`;
          }
          if (occurrences > 1) {
            return `Error: old_str found ${occurrences} times in ${args.path}. It must appear exactly once for a safe replacement. Include more surrounding context to make it unique.`;
          }

          const updated = content.replace(old_str, new_str ?? '');
          writeFileSync(filePath, updated, 'utf-8');
          return `Successfully replaced text in ${args.path}`;
        }

        case 'insert': {
          const filePath = safePath(notesDir, args.path);

          if (!existsSync(filePath)) {
            return `Error: File does not exist: ${args.path}`;
          }

          const content = readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');
          const insertLine = args.insert_line;

          if (insertLine < 0 || insertLine > lines.length) {
            return `Error: insert_line ${insertLine} is out of range (0-${lines.length})`;
          }

          lines.splice(insertLine, 0, args.new_str);
          writeFileSync(filePath, lines.join('\n'), 'utf-8');
          return `Successfully inserted text after line ${insertLine} in ${args.path}`;
        }

        default:
          return `Error: Unknown command: ${command}`;
      }
    },
  });
}
