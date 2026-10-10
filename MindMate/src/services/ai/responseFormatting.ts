/**
 * Shared presentation guidelines appended to every tutor system prompt
 * (Online Gemini, Offline WebLLM, and Auto routing) so answers are formatted
 * consistently. These rules govern presentation only — they never change the
 * subject of an answer or override conversation context.
 */

export const RESPONSE_FORMATTING_GUIDELINES = `Response Formatting Rules (presentation only — never change the subject):
1. Write in clean GitHub-flavored Markdown. Never wrap the whole answer in a code block and never output raw HTML.
2. Start with a direct one- or two-sentence answer. For longer answers, organise sections with "###" headings (use "####" for sub-sections only when needed).
3. Bold the key concept being defined and the 3-6 most important terms, e.g. "A **function** takes **parameters** and returns a **return value**". Never bold whole sentences or paragraphs.
4. Use numbered lists for steps or sequences and bullet lists for features, facts, or comparisons. Keep list items short.
5. Use a Markdown table only for genuine comparisons (2+ items across shared attributes), with a header row and separator row.
6. Put code in fenced code blocks with a language tag (e.g. \`\`\`python) and use \`inline code\` for identifiers.
7. For genuinely important warnings or tips, use a short blockquote callout starting with "**Note:**", "**Tip:**", or "**Warning:**". Use at most one or two per answer.
8. End longer explanations with a brief "### Key Takeaways" list (2-4 bullets) when it helps revision.`;

/** Compact version for small on-device models where prompt length affects latency. */
export const COMPACT_FORMATTING_GUIDELINES = `Formatting: use Markdown. Begin with a direct answer. Use "###" headings for sections, **bold** only key terms (never whole sentences), numbered lists for steps, bullet lists for facts, and fenced code blocks with a language tag for code. No raw HTML.`;
