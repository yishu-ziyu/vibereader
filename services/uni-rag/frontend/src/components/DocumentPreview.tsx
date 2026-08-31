import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export function DocumentPreview({ selectedFile, documentContent, isLoadingDoc, onClose }: {
  selectedFile: string;
  documentContent: string;
  isLoadingDoc: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shrink-0">
        <span className="text-sm font-medium text-slate-700 truncate">{selectedFile}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {isLoadingDoc ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">加载中...</div>
        ) : selectedFile.toLowerCase().endsWith('.md') ? (
          <div className="prose prose-slate max-w-none text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {documentContent}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-mono">{documentContent}</pre>
        )}
      </div>
    </div>
  );
}
