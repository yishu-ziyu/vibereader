import { motion } from 'framer-motion';
import { FolderOpen, Wand2, Globe } from 'lucide-react';

export function WhyUniRag() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 overflow-y-auto p-6">
      <div className="max-w-sm">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">为什么选 uni-rag？</h3>
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <FolderOpen size={48} />
            </div>
            <div className="flex items-center gap-2 mb-1.5 relative z-10">
              <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center">
                <FolderOpen size={14} className="text-indigo-600" />
              </div>
              <span className="font-medium text-sm text-slate-800">数据不出域</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed relative z-10">
              论文初稿、商业合同、内部财报 — 这些东西你不敢传到 NotebookLM。uni-rag 在本地处理，文件不出这台机器。
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Wand2 size={48} />
            </div>
            <div className="flex items-center gap-2 mb-1.5 relative z-10">
              <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center">
                <Wand2 size={14} className="text-purple-600" />
              </div>
              <span className="font-medium text-sm text-slate-800">按需选模型</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed relative z-10">
              精读论文用推理强的，日常问答用便宜的，敏感文档用本地跑的。一个下拉框切换，不绑定任何一家。
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Globe size={48} />
            </div>
            <div className="flex items-center gap-2 mb-1.5 relative z-10">
              <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center">
                <Globe size={14} className="text-emerald-600" />
              </div>
              <span className="font-medium text-sm text-slate-800">PDF + 网页 + 视频</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed relative z-10">
              不只是 PDF。粘贴网页 URL 或 B 站/YouTube 链接，字幕自动提取，和 PDF 放在同一个知识库里一起问。
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
