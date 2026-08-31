import { motion } from 'framer-motion';
import { Wand2, Globe, FolderOpen } from 'lucide-react';
import MatrixBackground from './MatrixBackground';

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <motion.div key="landing" className="absolute inset-0 z-50 flex items-center justify-center bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <motion.div layoutId="hero-banner" className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0"><MatrixBackground /></div>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/40">
          <motion.h1 layoutId="hero-title" className="text-7xl md:text-[120px] font-bold tracking-tighter mb-4 text-white drop-shadow-2xl">uni-rag</motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-xl md:text-2xl text-slate-300 font-light tracking-wide mb-2 max-w-2xl mx-auto px-4">问你自己的文档，数据永远不离开你的电脑</motion.p>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="text-sm md:text-base text-slate-400 max-w-xl mx-auto mb-10 px-4">NotebookLM 把文件传到 Google 服务器。uni-rag 在本地完成一切。</motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-12 text-sm text-slate-300">
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center border border-slate-700/50 backdrop-blur-sm"><FolderOpen size={18} className="text-indigo-400" /></div><span className="text-left leading-tight font-medium">本地处理<br/><span className="text-slate-500 text-xs font-normal">论文和合同永远不会上传到云端</span></span></div>
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center border border-slate-700/50 backdrop-blur-sm"><Wand2 size={18} className="text-purple-400" /></div><span className="text-left leading-tight font-medium">换模型<br/><span className="text-slate-500 text-xs font-normal">推理用强的，闲聊用便宜的</span></span></div>
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center border border-slate-700/50 backdrop-blur-sm"><Globe size={18} className="text-emerald-400" /></div><span className="text-left leading-tight font-medium">混合来源<br/><span className="text-slate-500 text-xs font-normal">PDF + 网页 + 视频字幕一起问</span></span></div>
          </motion.div>
          <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} onClick={onEnter} className="px-8 py-3 bg-white text-black font-semibold rounded-full hover:bg-slate-200 transition-colors shadow-lg cursor-pointer text-lg flex items-center gap-2">进入工作区<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
