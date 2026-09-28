"use client";

import { cn } from "@/lib/utils";

type MarkdownContentProps = {
  content: string;
  className?: string;
};

type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "code"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

function renderInline(text: string): React.ReactNode[] {
  const pattern = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|`[^`\n]+?`|\[[^\]]+?\]\([^)]+?\)|\*[^*\n]+?\*|_[^_\n]+?_)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      nodes.push(
        <strong key={key++} className="font-bold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded-md bg-[color:var(--dash-soft)] px-1.5 py-0.5 font-mono text-[0.9em] text-[color:var(--dash-text)]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[") && token.includes("](")) {
      const labelEnd = token.indexOf("]");
      const href = token.slice(labelEnd + 2, -1);
      const label = token.slice(1, labelEnd);
      nodes.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[color:var(--dash-accent)] underline underline-offset-2 hover:brightness-110"
        >
          {label}
        </a>,
      );
    } else if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      nodes.push(
        <em key={key++} className="italic text-[color:var(--dash-muted)]">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && splitTableCells(trimmed).length >= 2;
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableCells(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4,
        text: headingMatch[2].trim(),
      });
      i += 1;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i += 1;
      }
      blocks.push({ type: "quote", text: quoteLines.join(" ") });
      continue;
    }

    if (
      isTableRow(trimmed) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitTableCells(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        const cells = splitTableCells(lines[i]);
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ""));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paragraphLines: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next ||
        next.startsWith("#") ||
        next.startsWith("> ") ||
        next.startsWith("```") ||
        /^[-*+]\s+/.test(next) ||
        /^\d+[.)]\s+/.test(next) ||
        isTableRow(next) ||
        /^---+$/.test(next) ||
        /^\*\*\*+$/.test(next)
      ) {
        break;
      }
      paragraphLines.push(next);
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

const headingClass: Record<1 | 2 | 3 | 4, string> = {
  1: "font-sans text-2xl font-bold tracking-[0.01em] text-[color:var(--dash-text)]",
  2: "font-sans text-xl font-bold tracking-[0.01em] text-[color:var(--dash-text)]",
  3: "font-sans text-lg font-semibold tracking-[0.005em] text-[color:var(--dash-text)]",
  4: "font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)]",
};

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const blocks = parseBlocks(content);

  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4";
            return (
              <Tag key={index} className={cn("mt-5 first:mt-0 leading-[1.5]", headingClass[block.level])}>
                {renderInline(block.text)}
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p
                key={index}
                className="adviser-chat-copy text-left"
              >
                {renderInline(block.text)}
              </p>
            );
          case "ul":
            return (
              <ul
                key={index}
                className="adviser-chat-copy my-1 list-disc space-y-1.5 pl-5 marker:text-[#0C2040]"
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="pl-0.5 text-left">
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={index}
                className="adviser-chat-copy my-1 list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-[#0C2040]"
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="pl-0.5 text-left">
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={index}
                className="border-l-2 border-[color:var(--dash-navy)] pl-3 text-brand-body text-left italic leading-[1.5] text-[color:var(--dash-muted)]"
              >
                {renderInline(block.text)}
              </blockquote>
            );
          case "hr":
            return <hr key={index} className="my-4 border-0 border-t border-[color:var(--dash-surface-border)]" />;
          case "code":
            return (
              <pre
                key={index}
                className="overflow-x-auto rounded-xl border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] p-3 text-sm leading-[1.5] text-[color:var(--dash-text)]"
              >
                <code className="font-mono whitespace-pre">{block.text}</code>
              </pre>
            );
          case "table":
            return (
              <div key={index} className="overflow-x-auto">
                <table className="adviser-chat-table">
                  <thead>
                    <tr>
                      {block.headers.map((header, headerIndex) => (
                        <th key={headerIndex}>{renderInline(header)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{renderInline(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
