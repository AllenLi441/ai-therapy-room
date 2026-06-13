import { memo, useMemo, type ReactNode } from "react";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): ReactNode {
  const escaped = escapeHtml(text);

  // 处理 **bold**：拆分并交替渲染普通文本和加粗文本
  const boldParts = escaped.split(/(\*\*[^*]+\*\*)/g);
  const processed = boldParts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    // 单换行 → <br/>
    if (!part.includes("\n")) {
      return part;
    }

    return part.split("\n").map((line, lineIndex, lines) => {
      if (lineIndex < lines.length - 1) {
        return (
          <span key={lineIndex}>
            {line}
            <br />
          </span>
        );
      }
      return line;
    });
  });

  if (processed.length === 1 && typeof processed[0] === "string") {
    return processed[0];
  }

  return processed;
}

type BlockType = "paragraph" | "unordered-list" | "ordered-list";

function classifyBlock(text: string): BlockType {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return "paragraph";
  }

  const allUnordered = lines.every((line) => /^[-*] /.test(line));
  if (allUnordered) {
    return "unordered-list";
  }

  const allOrdered = lines.every((line) => /^\d+\. /.test(line));
  if (allOrdered) {
    return "ordered-list";
  }

  return "paragraph";
}

function stripListPrefix(line: string) {
  return line.replace(/^[-*] /, "").replace(/^\d+\. /, "");
}

// Memoized: markdown parsing (split into blocks, classify, render inline) is
// O(n) in content length. During streaming the parent re-renders on every chunk,
// so without memoization every COMPLETED message would re-parse on each chunk.
// React.memo skips messages whose content is unchanged; useMemo caches the parse.
function SafeMarkdownImpl({ content }: { content: string }) {
  return useMemo<ReactNode>(() => {
    // 空内容：流式输出中，显示占位
    if (!content) {
      return null;
    }

    // 按双换行（含可能的多个空行）分割为段落块
    const blocks = content.split(/\n{2,}/).filter((block) => block.trim().length > 0);

    if (blocks.length === 0) {
      return <p>{renderInline(content)}</p>;
    }

    return (
      <>
        {blocks.map((block, index) => {
          const type = classifyBlock(block);

          if (type === "unordered-list") {
            const items = block
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            return (
              <ul className="md-ul" key={index}>
                {items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(stripListPrefix(item))}</li>
                ))}
              </ul>
            );
          }

          if (type === "ordered-list") {
            const items = block
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            return (
              <ol className="md-ol" key={index}>
                {items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(stripListPrefix(item))}</li>
                ))}
              </ol>
            );
          }

          return <p className="md-p" key={index}>{renderInline(block)}</p>;
        })}
      </>
    );
  }, [content]);
}

export const SafeMarkdown = memo(SafeMarkdownImpl);
