import ToolCall from './ToolCall';

/**
 * UIMessage from @ai-sdk/react. We type the subset we need rather than
 * importing the full type so the component stays self-contained.
 */
interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'data';
  content: string;
  parts: MessagePart[];
}

type MessagePart =
  | { type: 'text'; text: string }
  | {
      type: 'tool-invocation';
      toolInvocation: {
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
        state: 'call' | 'partial-call' | 'result';
        result?: unknown;
      };
    }
  | { type: 'reasoning'; reasoning: string }
  | { type: 'step-start' }
  | { type: string }; // catch-all for source, file, etc.

export default function Message({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] ${
          isUser
            ? 'bg-emerald-900/40 border border-emerald-800/50 rounded-2xl rounded-br-md px-4 py-2.5'
            : 'w-full'
        }`}
      >
        {/* Role label for assistant */}
        {!isUser && (
          <div className="text-[11px] text-emerald-500/70 font-medium mb-1 tracking-wide uppercase">
            Nucleus
          </div>
        )}

        {/* Render parts */}
        {message.parts.map((part, i) => (
          <PartRenderer key={i} part={part} isUser={isUser} />
        ))}

        {/* Fallback: if no parts, render content directly */}
        {message.parts.length === 0 && message.content && (
          <div className="whitespace-pre-wrap text-sm text-neutral-200 leading-relaxed">
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}

function PartRenderer({
  part,
  isUser,
}: {
  part: MessagePart;
  isUser: boolean;
}) {
  switch (part.type) {
    case 'text': {
      const text = (part as { type: 'text'; text: string }).text;
      if (!text.trim()) return null;
      return (
        <div
          className={`whitespace-pre-wrap text-sm leading-relaxed ${
            isUser ? 'text-neutral-100' : 'text-neutral-300'
          }`}
        >
          {text}
        </div>
      );
    }

    case 'tool-invocation': {
      const { toolInvocation } = part as {
        type: 'tool-invocation';
        toolInvocation: {
          toolCallId: string;
          toolName: string;
          args: Record<string, unknown>;
          state: 'call' | 'partial-call' | 'result';
          result?: unknown;
        };
      };
      return <ToolCall toolInvocation={toolInvocation} />;
    }

    case 'reasoning': {
      const reasoning = (part as { type: 'reasoning'; reasoning: string })
        .reasoning;
      if (!reasoning.trim()) return null;
      return (
        <details className="my-1">
          <summary className="text-[11px] text-neutral-500 cursor-pointer hover:text-neutral-400">
            💭 reasoning
          </summary>
          <div className="mt-1 text-xs text-neutral-500 whitespace-pre-wrap border-l-2 border-neutral-800 pl-3 ml-1">
            {reasoning}
          </div>
        </details>
      );
    }

    case 'step-start':
      return (
        <div className="my-2 border-t border-neutral-800/50" />
      );

    default:
      return null;
  }
}
