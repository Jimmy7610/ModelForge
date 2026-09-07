import React from 'react';
import { FileCode2 } from 'lucide-react';
import { CopyButton } from '../CopyButton';
import { parseMessageBlocks, formatLanguageBadge } from './message-parser';
import './FormattedMessage.css';

interface FormattedMessageProps {
  content: string;
  isStreaming?: boolean;
  isUser?: boolean;
}

/**
 * Parses inline formatting: `code`, **bold**, *italic*
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Regex splitting by inline code: `...`
  const codeRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(renderBoldItalic(text.slice(lastIndex, match.index), parts.length));
    }
    parts.push(
      <code key={`code-${match.index}`} className="msg-inline-code">
        {match[1]}
      </code>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(renderBoldItalic(text.slice(lastIndex), parts.length));
  }

  return parts;
}

/**
 * Handles **bold** and *italic* formatting within text
 */
function renderBoldItalic(text: string, keyPrefix: number): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={`b-${keyPrefix}-${match.index}`}>{match[1]}</strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/**
 * Renders a text block with support for headings, lists, and paragraphs
 */
function renderTextBlock(content: string, blockIdx: number): React.ReactNode {
  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<div key={`br-${blockIdx}-${i}`} style={{ height: '4px' }} />);
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${blockIdx}-${i}`} className="msg-heading-3">
          {renderInlineFormatting(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${blockIdx}-${i}`} className="msg-heading-2">
          {renderInlineFormatting(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${blockIdx}-${i}`} className="msg-heading-1">
          {renderInlineFormatting(trimmed.slice(2))}
        </h2>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      // Bullet list
      elements.push(
        <div key={`li-${blockIdx}-${i}`} className="msg-list-item">
          <span className="msg-list-bullet">•</span>
          <span>{renderInlineFormatting(trimmed.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      // Numbered list
      const numMatch = trimmed.match(/^(\d+\.)\s(.*)$/);
      if (numMatch) {
        elements.push(
          <div key={`nli-${blockIdx}-${i}`} className="msg-list-item">
            <span className="msg-list-bullet">{numMatch[1]}</span>
            <span>{renderInlineFormatting(numMatch[2])}</span>
          </div>
        );
      } else {
        elements.push(
          <p key={`p-${blockIdx}-${i}`} className="msg-paragraph">
            {renderInlineFormatting(line)}
          </p>
        );
      }
    } else {
      // Standard paragraph line
      elements.push(
        <p key={`p-${blockIdx}-${i}`} className="msg-paragraph">
          {renderInlineFormatting(line)}
        </p>
      );
    }
  }

  return (
    <div key={`text-block-${blockIdx}`} className="msg-text-block">
      {elements}
    </div>
  );
}

export const FormattedMessage: React.FC<FormattedMessageProps> = ({
  content,
  isStreaming = false,
  isUser = false,
}) => {
  if (!content && !isStreaming) {
    return null;
  }

  // If message from user, keep it clean and standard
  if (isUser) {
    return (
      <div className="formatted-message-root">
        <p className="msg-paragraph">{content}</p>
      </div>
    );
  }

  const blocks = parseMessageBlocks(content);

  return (
    <div className="formatted-message-root">
      {blocks.map((block, idx) => {
        const isLastBlock = idx === blocks.length - 1;

        if (block.type === 'code') {
          const rawCode = block.code;
          const displayBadge = formatLanguageBadge(block.language);

          return (
            <div key={`code-block-${idx}`} className="code-block-card">
              <div className="code-block-header">
                <div className="code-block-header-left">
                  <FileCode2 size={13} className="text-secondary" />
                  <span className="code-block-lang-badge">{displayBadge}</span>
                </div>
                <CopyButton
                  text={rawCode}
                  label="Copy Code"
                  successLabel="Copied"
                  compact
                  tooltip="Copy code snippet to clipboard"
                  ariaLabel={`Copy ${displayBadge} code`}
                />
              </div>
              <pre className="code-block-content custom-scrollbar">
                <code>{rawCode}</code>
                {isStreaming && isLastBlock && !block.isClosed && (
                  <span className="chat-streaming-caret" aria-hidden="true">
                    ▋
                  </span>
                )}
              </pre>
            </div>
          );
        }

        return (
          <React.Fragment key={`text-frag-${idx}`}>
            {renderTextBlock(block.content, idx)}
            {isStreaming && isLastBlock && (
              <span className="chat-streaming-caret" aria-hidden="true">
                ▋
              </span>
            )}
          </React.Fragment>
        );
      })}

      {blocks.length === 0 && isStreaming && (
        <span className="chat-streaming-caret" aria-hidden="true">
          ▋
        </span>
      )}
    </div>
  );
};
