/**
 * Markdown preparation helpers for AI tutor responses.
 *
 * These helpers never strip characters blindly. They only:
 *  - temporarily close unbalanced constructs while a response is streaming
 *    (so partial tokens never render as stray symbols),
 *  - repair a small set of structural issues that prevent valid GFM from parsing
 *    (e.g. a table glued directly to the preceding paragraph),
 *  - add conservative emphasis to a defined concept when a response contains
 *    no emphasis at all.
 *
 * Content inside fenced code blocks is always left untouched.
 */

const FENCE_RE = /^\s{0,3}(```|~~~)/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

interface LineInfo {
  text: string;
  inFence: boolean;
  isFence: boolean;
}

/** Annotate each line with whether it sits inside a fenced code block. */
function annotateLines(markdown: string): LineInfo[] {
  const lines = markdown.split('\n');
  let inFence = false;
  let fenceMarker = '';
  return lines.map((text) => {
    const match = text.match(FENCE_RE);
    if (match) {
      if (!inFence) {
        inFence = true;
        fenceMarker = match[1];
        return { text, inFence: true, isFence: true };
      }
      if (match[1] === fenceMarker) {
        inFence = false;
        return { text, inFence: true, isFence: true };
      }
    }
    return { text, inFence, isFence: false };
  });
}

/** Returns true if the markdown currently ends inside an unclosed code fence. */
export function hasUnclosedFence(markdown: string): boolean {
  const lines = annotateLines(markdown);
  let open = false;
  for (const l of lines) {
    if (l.isFence) open = !open;
  }
  return open;
}

/** Count non-escaped occurrences of a token in a string, ignoring inline code spans. */
function countToken(line: string, token: string): number {
  const withoutCode = line.replace(/`[^`]*`/g, '');
  let count = 0;
  let idx = withoutCode.indexOf(token);
  while (idx !== -1) {
    if (idx === 0 || withoutCode[idx - 1] !== '\\') count++;
    idx = withoutCode.indexOf(token, idx + token.length);
  }
  return count;
}

/**
 * While streaming, temporarily balance constructs that are still being typed
 * so the renderer shows formatted output instead of raw markers.
 * The stored message content is never modified — this only affects display.
 */
export function prepareStreamingMarkdown(markdown: string): string {
  if (!markdown) return markdown;
  let output = markdown;

  if (hasUnclosedFence(output)) {
    // Close the open fence so the partial code renders as a code block.
    return output.endsWith('\n') ? `${output}\`\`\`` : `${output}\n\`\`\``;
  }

  const lines = output.split('\n');
  const lastLine = lines[lines.length - 1];

  // Hide a dangling heading marker / list bullet / partial rule that has no text yet.
  if (/^\s{0,3}(#{1,6}|[-*+]|\d+\.|-{1,2}|\*{1,2}|\|)\s*$/.test(lastLine)) {
    lines.pop();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    return lines.join('\n');
  }

  // Hide an incomplete table separator row (e.g. fewer columns than header or incomplete dashes)
  if (/^\s*\|[\s:|-]*$/.test(lastLine)) {
    if (lines.length >= 2) {
      const prevLine = lines[lines.length - 2];
      if (prevLine.trim().startsWith('|')) {
        const prevCols = prevLine.split('|').filter((c) => c.trim().length > 0).length;
        const currCols = lastLine.split('|').filter((c) => c.trim().replace(/:|-/g, '').length === 0 && c.includes('-')).length;
        if (currCols < prevCols || !TABLE_SEPARATOR_RE.test(lastLine)) {
          lines.pop();
          return lines.join('\n');
        }
      }
    } else if (!TABLE_SEPARATOR_RE.test(lastLine)) {
      lines.pop();
      return lines.join('\n');
    }
  }

  let suffix = '';
  // Odd inline code backticks → close the span.
  if (countToken(lastLine.replace(/```/g, ''), '`') % 2 === 1) {
    suffix += '`';
  }
  // Odd bold markers → close the bold.
  if (countToken(lastLine, '**') % 2 === 1) {
    // Avoid creating "****" when the line ends with an opening marker.
    if (/\*\*\s*$/.test(lastLine)) {
      lines[lines.length - 1] = lastLine.replace(/\*\*\s*$/, '');
    } else {
      suffix += '**';
    }
  }
  output = lines.join('\n') + suffix;
  return output;
}

/**
 * Repairs structural issues so valid GFM parses as intended.
 *  - Inserts a blank line before a table that directly follows paragraph text.
 *  - Inserts a blank line before a heading that directly follows paragraph text.
 */
export function normalizeMarkdown(markdown: string): string {
  if (!markdown) return markdown;
  const lines = annotateLines(markdown.replace(/\r\n/g, '\n'));
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const prev = out.length > 0 ? out[out.length - 1] : '';
    const next = lines[i + 1];

    if (!current.inFence && prev.trim() !== '' && !lines[i - 1]?.inFence) {
      const isTableHeader =
        current.text.trim().startsWith('|') &&
        next !== undefined &&
        !next.inFence &&
        TABLE_SEPARATOR_RE.test(next.text) &&
        !prev.trim().startsWith('|');

      const isAtxHeading = /^\s{0,3}#{1,6}\s+\S/.test(current.text);

      if (isTableHeader || isAtxHeading) {
        out.push('');
      }
    }
    out.push(current.text);
  }
  return out.join('\n');
}

const DEFINITION_RE =
  /^((?:In [^,\n]{1,40},\s+)?(?:(?:A|An|The)\s+)?)([A-Za-z][A-Za-z0-9'’\- ]{1,40}?)(\s+(?:is|are|refers to|means|describes)\s+(?:a|an|the|when|how|used|any|one|two|called|defined|simply|basically|essentially)\b)/;

const STOP_TERMS = new Set([
  'it', 'this', 'that', 'there', 'here', 'they', 'which', 'what', 'who', 'he', 'she', 'we', 'you', 'i',
  'answer', 'question', 'example', 'result', 'reason', 'idea', 'thing', 'point', 'key', 'goal'
]);

/**
 * When a response contains no emphasis at all, bold the concept being defined
 * in definitional sentences ("A function is a reusable block…" → "A **function** is…").
 * Applies to at most `maxTerms` paragraphs, never inside code, tables, headings, or quotes.
 * The wording of the answer is never changed.
 */
export function emphasizeKeyConcepts(markdown: string, maxTerms = 3): string {
  if (!markdown) return markdown;
  if (/\*\*[^*\n]+\*\*|__[^_\n]+__/.test(markdown)) return markdown;

  const lines = annotateLines(markdown);
  let applied = 0;
  let prevBlank = true;
  const emphasized = new Set<string>();

  const out = lines.map((line) => {
    const isBlank = line.text.trim() === '';
    const startsParagraph = prevBlank;
    prevBlank = isBlank;

    if (applied >= maxTerms || line.inFence || isBlank || !startsParagraph) return line.text;
    if (/^\s*(#|\||>|[-*+]\s|\d+\.\s|`)/.test(line.text)) return line.text;

    const match = line.text.match(DEFINITION_RE);
    if (!match) return line.text;

    const term = match[2].trim();
    const lower = term.toLowerCase();
    if (STOP_TERMS.has(lower) || term.split(/\s+/).length > 5 || emphasized.has(lower)) return line.text;

    emphasized.add(lower);
    applied++;
    const termStart = match[1].length;
    const termEnd = termStart + match[2].length;
    const rawTerm = line.text.slice(termStart, termEnd);
    const trailingSpace = rawTerm.match(/\s*$/)?.[0] || '';
    return (
      line.text.slice(0, termStart) +
      `**${rawTerm.trimEnd()}**` +
      trailingSpace +
      line.text.slice(termEnd)
    );
  });

  return out.join('\n');
}

/** Full display pipeline used by the chat renderer. */
export function prepareMarkdownForDisplay(markdown: string, options: { streaming?: boolean } = {}): string {
  if (!markdown) return '';
  const normalized = normalizeMarkdown(markdown);
  if (options.streaming) {
    // Emphasis is applied only once the answer is complete to avoid flicker.
    return prepareStreamingMarkdown(normalized);
  }
  return emphasizeKeyConcepts(normalized);
}
