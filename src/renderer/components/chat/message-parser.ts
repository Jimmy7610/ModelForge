/**
 * Streaming-Safe Markdown & Code Block Parser for Model Forge
 */

export interface CodeBlockItem {
  type: 'code';
  language: string;
  code: string;
  isClosed: boolean;
}

export interface TextBlockItem {
  type: 'text';
  content: string;
}

export type MessageBlock = CodeBlockItem | TextBlockItem;

/**
 * Parses message content into text blocks and fenced code blocks.
 * Safely handles unclosed code blocks during token streaming.
 */
export function parseMessageBlocks(content: string): MessageBlock[] {
  if (!content) return [];
  const blocks: MessageBlock[] = [];
  const fenceRegex = /```([a-zA-Z0-9_.-]*)\r?\n?/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    const startIndex = match.index;
    // Add text preceding this fence
    if (startIndex > lastIndex) {
      const text = content.slice(lastIndex, startIndex);
      if (text) {
        blocks.push({ type: 'text', content: text });
      }
    }

    const lang = (match[1] || '').trim().toLowerCase();
    const codeStartIndex = match.index + match[0].length;
    // Find closing ```
    const closeIndex = content.indexOf('```', codeStartIndex);

    if (closeIndex !== -1) {
      // Complete code block
      const code = content.slice(codeStartIndex, closeIndex);
      blocks.push({
        type: 'code',
        language: lang,
        code,
        isClosed: true,
      });
      lastIndex = closeIndex + 3;
      fenceRegex.lastIndex = lastIndex;
    } else {
      // Unclosed code block (currently streaming)
      const code = content.slice(codeStartIndex);
      blocks.push({
        type: 'code',
        language: lang,
        code,
        isClosed: false,
      });
      lastIndex = content.length;
      break;
    }
  }

  // Add any remaining text
  if (lastIndex < content.length) {
    const remainingText = content.slice(lastIndex);
    if (remainingText) {
      blocks.push({ type: 'text', content: remainingText });
    }
  }

  return blocks;
}

/**
 * Normalizes language labels for display badges
 */
export function formatLanguageBadge(lang: string): string {
  if (!lang) return 'CODE';
  const clean = lang.trim().toUpperCase();
  const map: Record<string, string> = {
    TYPESCRIPT: 'TS',
    JAVASCRIPT: 'JS',
    TSX: 'TSX',
    JSX: 'JSX',
    PYTHON: 'PYTHON',
    PY: 'PYTHON',
    BASH: 'BASH',
    SH: 'SHELL',
    SHELL: 'SHELL',
    JSON: 'JSON',
    MARKDOWN: 'MD',
    MD: 'MD',
    CSS: 'CSS',
    HTML: 'HTML',
    SQL: 'SQL',
    RUST: 'RUST',
    CPP: 'C++',
    C: 'C',
    YAML: 'YAML',
    YML: 'YAML',
  };
  return map[clean] || clean;
}
