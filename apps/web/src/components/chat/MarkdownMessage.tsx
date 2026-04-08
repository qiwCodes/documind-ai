"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type MarkdownMessageProps = {
  content: string;
  className?: string;
};

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div className={cn("text-sm leading-7 text-slate-800", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mt-1 mb-3 text-lg font-semibold text-slate-950">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-4 mb-2 text-base font-semibold text-slate-950">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-3 mb-2 text-sm font-semibold text-slate-900">{children}</h3>,
          p: ({ children }) => <p className="mb-3 whitespace-pre-wrap last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="pl-1 marker:text-slate-500">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-slate-950">{children}</strong>,
          em: ({ children }) => <em className="italic text-slate-700">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-slate-300 pl-4 text-slate-600 italic last:mb-0">
              {children}
            </blockquote>
          ),
          code: ({ children, className: codeClassName }) => {
            const isBlock = Boolean(codeClassName);
            if (isBlock) {
              return <code className={codeClassName}>{children}</code>;
            }

            return (
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-900">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-[13px] text-slate-100 last:mb-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto rounded-xl border border-slate-200 last:mb-0">
              <table className="min-w-full border-collapse text-left text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-100 text-slate-800">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-slate-200">{children}</tbody>,
          tr: ({ children }) => <tr className="align-top">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-slate-700">{children}</td>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-indigo-700 underline underline-offset-2"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
