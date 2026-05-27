/** Line/column at a UTF-16 code unit offset (matches JSON.parse position in V8). */
export function lineColAtOffset(source: string, offset: number): { line: number; column: number } {
  const safe = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let column = 1;
  for (let i = 0; i < safe; i++) {
    if (source[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function snippetForLine(source: string, line: number, column: number): string | null {
  const lineText = source.split(/\r?\n/)[line - 1];
  if (lineText === undefined) return null;
  const caretCol = Math.max(0, column - 1);
  const caret = " ".repeat(Math.min(caretCol, 120)) + "^";
  return `  ${line} | ${lineText}\n     | ${caret}`;
}

/**
 * Human-readable JSON syntax error with line/column and a source snippet.
 */
export function formatJsonParseError(
  source: string,
  err: unknown,
  filePath?: string
): string {
  const head = filePath ? `Invalid JSON in ${filePath}` : "Invalid JSON";
  if (!(err instanceof SyntaxError)) {
    const detail = err instanceof Error ? err.message : String(err);
    return `${head}: ${detail}`;
  }

  const msg = err.message;
  const lineColFromMsg = msg.match(/line (\d+) column (\d+)/i);
  const posMatch = msg.match(/position (\d+)/i);
  const position = posMatch ? parseInt(posMatch[1], 10) : undefined;

  let line: number | undefined;
  let column: number | undefined;
  if (lineColFromMsg) {
    line = parseInt(lineColFromMsg[1], 10);
    column = parseInt(lineColFromMsg[2], 10);
  } else if (position !== undefined) {
    ({ line, column } = lineColAtOffset(source, position));
  }

  const lines: string[] = [`${head}:`, `  ${msg}`];
  if (line !== undefined && column !== undefined) {
    lines.push(`  at line ${line}, column ${column}`);
    const snippet = snippetForLine(source, line, column);
    if (snippet) lines.push(snippet);
  } else if (position !== undefined) {
    lines.push(`  at byte offset ${position}`);
  }
  return lines.join("\n");
}
