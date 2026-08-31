import { FileText, FolderOpen } from 'lucide-react';

export function EmptyState({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 flex items-center justify-center p-8">
      <div className="bg-white w-full max-w-3xl h-full shadow-sm border border-slate-200 rounded-md flex flex-col items-center justify-center text-slate-400">
        <FolderOpen size={48} className="mb-4 text-slate-300" strokeWidth={1.5} />
        <p className="text-lg font-medium text-slate-500 mb-6">
          你的第一个知识库
        </p>

        <button
          onClick={onUploadClick}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-2 mb-8 transition-colors shadow-sm"
        >
          <FileText size={18} />
          上传第一份文档
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-100">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          所有数据仅存于本地，不上传任何第三方服务器
        </div>
      </div>
    </div>
  );
}
