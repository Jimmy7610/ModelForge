import { describe, it, expect } from 'vitest';
import { parseMessageBlocks, formatLanguageBadge } from '../src/renderer/components/chat/message-parser';

describe('Message Parser & Code Block Extraction (Pass 4.1)', () => {
  it('handles empty content gracefully', () => {
    expect(parseMessageBlocks('')).toEqual([]);
    expect(parseMessageBlocks(null as any)).toEqual([]);
  });

  it('parses plain text without code fences as single text block', () => {
    const text = 'Hello world! Model Forge runs completely locally.';
    const blocks = parseMessageBlocks(text);

    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe('text');
    if (blocks[0].type === 'text') {
      expect(blocks[0].content).toBe(text);
    }
  });

  it('extracts closed fenced code blocks with language tag and clean code content', () => {
    const content = 'Here is the implementation:\n```typescript\nconst greeting: string = "Hello Model Forge";\nconsole.log(greeting);\n```\nLet me know if you need more.';
    const blocks = parseMessageBlocks(content);

    expect(blocks.length).toBe(3);
    expect(blocks[0].type).toBe('text');
    expect(blocks[1].type).toBe('code');
    expect(blocks[2].type).toBe('text');

    const codeBlock = blocks[1];
    if (codeBlock.type === 'code') {
      expect(codeBlock.language).toBe('typescript');
      expect(codeBlock.isClosed).toBe(true);
      // Verify clean code does not contain ``` fences
      expect(codeBlock.code).not.toContain('```');
      expect(codeBlock.code).toContain('const greeting: string');
    }
  });

  it('safely parses streaming unclosed code blocks without crashing or dropping content', () => {
    const streamingContent = 'Generating code:\n```python\ndef compute_accuracy():\n    return 0.98';
    const blocks = parseMessageBlocks(streamingContent);

    expect(blocks.length).toBe(2);
    expect(blocks[0].type).toBe('text');
    expect(blocks[1].type).toBe('code');

    const codeBlock = blocks[1];
    if (codeBlock.type === 'code') {
      expect(codeBlock.language).toBe('python');
      expect(codeBlock.isClosed).toBe(false);
      expect(codeBlock.code).toContain('def compute_accuracy()');
    }
  });

  it('parses multiple code blocks interspersed with explanations', () => {
    const multiBlock = `
Step 1: Install packages
\`\`\`bash
npm install
\`\`\`
Step 2: Start dev
\`\`\`bash
npm run dev
\`\`\`
All done!
`;
    const blocks = parseMessageBlocks(multiBlock);
    const codeBlocks = blocks.filter((b) => b.type === 'code');

    expect(codeBlocks.length).toBe(2);
    expect(codeBlocks[0].type === 'code' && codeBlocks[0].code.trim()).toBe('npm install');
    expect(codeBlocks[1].type === 'code' && codeBlocks[1].code.trim()).toBe('npm run dev');
  });

  it('formats language badges cleanly', () => {
    expect(formatLanguageBadge('typescript')).toBe('TS');
    expect(formatLanguageBadge('javascript')).toBe('JS');
    expect(formatLanguageBadge('python')).toBe('PYTHON');
    expect(formatLanguageBadge('bash')).toBe('BASH');
    expect(formatLanguageBadge('json')).toBe('JSON');
    expect(formatLanguageBadge('markdown')).toBe('MD');
    expect(formatLanguageBadge('')).toBe('CODE');
    expect(formatLanguageBadge('unknown_lang')).toBe('UNKNOWN_LANG');
  });
});
