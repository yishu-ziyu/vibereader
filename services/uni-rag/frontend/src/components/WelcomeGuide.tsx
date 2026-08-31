import { motion } from 'framer-motion';

export function WelcomeGuide({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">上传文档，开始提问。</h2>
        <p className="text-slate-500 mb-8 font-medium">你的文件只存在这台机器上，不会发到任何服务器。</p>

        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">1</div>
            <div>
              <h3 className="font-semibold text-slate-800 mb-1">上传文档</h3>
              <p className="text-sm text-slate-500 leading-relaxed">在左侧「我的文件夹」面板点击「上传文件」，选择一份 PDF 或 Markdown 文档。系统会自动解析、切分并建立索引。</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">2</div>
            <div>
              <h3 className="font-semibold text-slate-800 mb-1">选择来源</h3>
              <p className="text-sm text-slate-500 leading-relaxed">上传完成后，文档会出现在左侧文件列表中。点击选中它，AI 就会基于这份文档来回答你的问题。</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">3</div>
            <div>
              <h3 className="font-semibold text-slate-800 mb-1">开始提问</h3>
              <p className="text-sm text-slate-500 leading-relaxed">在右侧对话框输入你的问题，AI 会从文档中找到相关内容并给出答案，同时标注引用来源。你可以继续追问，对话上下文会保留。</p>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200">
          <button onClick={onDismiss} className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">去上传文档</button>
        </div>
      </div>
    </motion.div>
  );
}
