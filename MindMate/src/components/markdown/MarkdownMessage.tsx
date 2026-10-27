import React, { memo, useMemo, useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, Info, AlertTriangle, Lightbulb } from 'lucide-react';
import { cn } from '../../utils';
import { prepareMarkdownForDisplay } from './markdownUtils';

interface MarkdownMessageProps {
  /** Raw markdown produced by the AI model (Gemini or WebLLM). */
  content: string;
  /** True while tokens are still arriving — enables streaming-safe balancing. */
  streaming?: boolean;
  className?: string;
}

/** Copy-to-clipboard button with a graceful fallback for non-secure contexts. */
function CopyButton({ text, label = 'Copy code' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Code copied' : label}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-700/70 transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Styled fenced code block with language label and copy control. */
export function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="mate-code-block my-3 rounded-xl border border-slate-800 bg-[#0F172A] text-[#F8FAFC] shadow-xs overflow-hidden max-w-full text-left">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-800/80 px-3.5 py-1.5">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300">{language || 'code'}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed font-mono text-[#F8FAFC]">
        <code className="text-[#F8FAFC]">{code}</code>
      </pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) return extractText((node.props as any).children);
  return '';
}

/** Detects "Note:", "Tip:", "Warning:" style callouts inside blockquotes. */
function getCalloutTone(children: React.ReactNode): 'warning' | 'tip' | 'note' {
  const text = extractText(children).trim().toLowerCase();
  if (/^(warning|caution|important|common mistake|pitfall|danger)\b/.test(text)) return 'warning';
  if (/^(tip|hint|pro tip|remember|key takeaway|exam tip)\b/.test(text)) return 'tip';
  return 'note';
}

const components: Components = {
  h1: ({ node, ...props }) => (
    <h3 className="mt-4 mb-2 first:mt-0 text-lg font-bold text-dark tracking-tight" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h4 className="mt-4 mb-2 first:mt-0 text-base font-bold text-dark tracking-tight" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h5 className="mt-3.5 mb-1.5 first:mt-0 text-[15px] font-semibold text-dark" {...props} />
  ),
  h4: ({ node, ...props }) => (
    <h6 className="mt-3 mb-1 first:mt-0 text-sm font-semibold text-dark" {...props} />
  ),
  h5: ({ node, ...props }) => (
    <p className="mt-3 mb-1 first:mt-0 text-sm font-semibold text-dark/90" {...props} />
  ),
  h6: ({ node, ...props }) => (
    <p className="mt-3 mb-1 first:mt-0 text-xs font-semibold uppercase tracking-wider text-muted" {...props} />
  ),
  p: ({ node, ...props }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed text-dark" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-dark" {...props} />,
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  del: ({ node, ...props }) => <del className="text-muted" {...props} />,
  ul: ({ node, ...props }) => (
    <ul className="my-2 ml-1 space-y-1 list-disc pl-5 marker:text-[#4F46E5]" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="my-2 ml-1 space-y-1 list-decimal pl-5 marker:font-semibold marker:text-[#4F46E5]" {...props} />
  ),
  li: ({ node, ...props }) => <li className="pl-1 leading-relaxed text-dark [&>p]:my-1" {...props} />,
  hr: () => <hr className="my-4 border-0 border-t border-border" />,
  a: ({ node, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="font-medium text-[#4F46E5] underline underline-offset-2 hover:text-[#4338CA] break-words"
      {...props}
    />
  ),
  blockquote: ({ node, children }) => {
    const tone = getCalloutTone(children);
    const Icon = tone === 'warning' ? AlertTriangle : tone === 'tip' ? Lightbulb : Info;
    return (
      <div
        role="note"
        className={cn(
          'my-3 flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] [&_p]:my-0.5',
          tone === 'warning' && 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]',
          tone === 'tip' && 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]',
          tone === 'note' && 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]'
        )}
      >
        <Icon
          className={cn(
            'h-4 w-4 shrink-0 mt-0.5',
            tone === 'warning' && 'text-[#92400E]',
            tone === 'tip' && 'text-[#047857]',
            tone === 'note' && 'text-[#1D4ED8]'
          )}
        />
        <div className="min-w-0">{children}</div>
      </div>
    );
  },
  table: ({ node, ...props }) => (
    <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-border bg-surface shadow-xs">
      <table className="w-full border-collapse text-left text-[13px] text-dark" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-[#F8FAFC] text-dark border-b border-border" {...props} />,
  tr: ({ node, ...props }) => <tr className="border-b border-border last:border-0 even:bg-[#F8FAFC]" {...props} />,
  th: ({ node, style, ...props }) => (
    <th className="px-3 py-2 font-semibold whitespace-nowrap text-dark" style={style} {...props} />
  ),
  td: ({ node, style, ...props }) => <td className="px-3 py-2 align-top text-dark" style={style} {...props} />,
  pre: ({ node, children }) => {
    const child = React.Children.toArray(children)[0];
    const childProps = React.isValidElement(child) ? (child.props as any) : {};
    const language = /language-([\w+-]+)/.exec(childProps.className || '')?.[1];
    const code = extractText(childProps.children ?? children).replace(/\n$/, '');
    return <CodeBlock code={code} language={language} />;
  },
  code: ({ node, className, children, ...props }) => (
    <code
      className={cn(
        'rounded-md border border-[#C7D2FE] bg-[#EEF2FF] px-1.5 py-0.5 font-mono text-[0.85em] text-[#3730A3] break-words',
        className
      )}
      {...props}
    >
      {children}
    </code>
  ),
  img: ({ node, alt }) => (
    // Model-supplied image URLs are not loaded; visuals come from the Visual Learning Engine.
    <span className="italic text-muted">{alt ? `[Image: ${alt}]` : '[Image]'}</span>
  )
};

/**
 * Safe markdown renderer for AI tutor messages.
 * - GFM tables, lists, strikethrough, task lists via remark-gfm.
 * - Raw HTML from the model is NOT rendered (react-markdown escapes raw HTML tags by default).
 * - Unsafe URL protocols are stripped by react-markdown's default urlTransform.
 */
export const MarkdownMessage = memo(function MarkdownMessage({ content, streaming, className }: MarkdownMessageProps) {
  const prepared = useMemo(() => prepareMarkdownForDisplay(content, { streaming }), [content, streaming]);

  return (
    <div className={cn('mate-markdown min-w-0 break-words text-sm text-dark', className)} data-testid="markdown-message">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {prepared}
      </ReactMarkdown>
    </div>
  );
});
