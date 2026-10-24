import React from 'react';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Parses inline formatting:
 * - **bold** or __bold__ -> <strong>
 * - *italic* or _italic_ -> <em>
 * - `code` -> <code>
 * - [label](url) -> <a>
 */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  // Regex pattern matching inline code, bold, italic, and links
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    if (!part) return null;

    // Inline code `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={index} className="doorare-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold **bold** or __bold__
    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return (
        <strong key={index} className="doorare-md-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic *italic* or _italic_
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <em key={index} className="doorare-md-italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Link [label](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="doorare-md-link"
        >
          {linkMatch[1]}
        </a>
      );
    }

    // Plain text
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

/**
 * Lightweight, zero-dependency Markdown renderer for DooRare Copilot chat bubbles.
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Split into lines
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = () => {
    if (currentList) {
      const ListTag = currentList.type;
      elements.push(
        <ListTag key={`list-${elements.length}`} className={`doorare-md-${currentList.type}`}>
          {currentList.items.map((item, idx) => (
            <li key={idx}>{renderInlineMarkdown(item)}</li>
          ))}
        </ListTag>,
      );
      currentList = null;
    }
  };

  const flushCodeBlock = () => {
    if (inCodeBlock) {
      const codeString = codeBlockLines.join('\n');
      elements.push(
        <div key={`code-${elements.length}`} className="doorare-code-block-wrapper">
          {codeBlockLang && <div className="doorare-code-lang">{codeBlockLang}</div>}
          <pre className="doorare-code-block">
            <code>{codeString}</code>
          </pre>
        </div>,
      );
      inCodeBlock = false;
      codeBlockLang = '';
      codeBlockLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code Block Delimiter ```
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    // Empty line -> flush list and add spacer
    if (!trimmed) {
      flushList();
      continue;
    }

    // Markdown Table: | Col 1 | Col 2 |
    if (
      trimmed.startsWith('|') &&
      trimmed.endsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].trim().startsWith('|') &&
      /^\|(\s*:?-+:?\s*\|)+$/.test(lines[i + 1].trim())
    ) {
      flushList();
      const parseRow = (r: string) =>
        r
          .trim()
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(trimmed);
      i++; // Skip delimiter row

      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && lines[i + 1].trim().endsWith('|')) {
        i++;
        rows.push(parseRow(lines[i]));
      }

      elements.push(
        <div key={`table-${i}`} className="doorare-md-table-wrap">
          <table className="doorare-md-table">
            <thead>
              <tr>
                {headers.map((h, colIdx) => (
                  <th key={colIdx}>{renderInlineMarkdown(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx}>{renderInlineMarkdown(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Headings: #, ##, ###
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={`h1-${i}`} className="doorare-md-h1">
          {renderInlineMarkdown(trimmed.slice(2))}
        </h2>,
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={`h2-${i}`} className="doorare-md-h2">
          {renderInlineMarkdown(trimmed.slice(3))}
        </h3>,
      );
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={`h3-${i}`} className="doorare-md-h3">
          {renderInlineMarkdown(trimmed.slice(4))}
        </h4>,
      );
      continue;
    }

    // Blockquote: > text
    if (trimmed.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote key={`quote-${i}`} className="doorare-md-quote">
          {renderInlineMarkdown(trimmed.slice(2))}
        </blockquote>,
      );
      continue;
    }

    // Unordered List item: - item or * item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.slice(2);
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [itemText] };
      } else {
        currentList.items.push(itemText);
      }
      continue;
    }

    // Ordered List item: 1. item, 2. item
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      const itemText = orderedMatch[2];
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [itemText] };
      } else {
        currentList.items.push(itemText);
      }
      continue;
    }

    // Regular Paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="doorare-md-p">
        {renderInlineMarkdown(line)}
      </p>,
    );
  }

  flushList();
  flushCodeBlock();

  return <div className={`doorare-markdown-body ${className}`}>{elements}</div>;
};
