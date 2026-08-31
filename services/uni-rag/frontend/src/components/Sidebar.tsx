import { motion, AnimatePresence } from 'framer-motion';
import type { ChangeEvent } from 'react';
import { Home, Search, FolderOpen, Layout, Link2, Loader2, Settings, FileText, File, PlayCircle, Tv, Globe } from 'lucide-react';
import { NavItem, FileItem } from './ui';
import MatrixBackground from './MatrixBackground';

export function Sidebar({
  isWorkspaceMode,
  showHome,
  setShowHome,
  activeTab,
  files,
  urlInput,
  setUrlInput,
  showUrlInput,
  setShowUrlInput,
  urlJobs,
  isUploading,
  handleUrlIngest,
  handleFileUpload,
  onFileSelect,
  onSettingsClick,
  onDiscoverClick,
}: {
  isWorkspaceMode: boolean;
  showHome: boolean;
  setShowHome: (v: boolean) => void;
  activeTab: string;
  files: any[];
  urlInput: string;
  setUrlInput: (v: string) => void;
  showUrlInput: boolean;
  setShowUrlInput: (v: boolean) => void;
  urlJobs: Map<string, any>;
  isUploading: boolean;
  handleUrlIngest: () => void;
  handleFileUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onFileSelect: (filename: string) => void;
  onSettingsClick: () => void;
  onDiscoverClick?: () => void;
}) {
  const getPlatformIcon = (url: string) => {
    if (/youtube\.com|youtu\.be/.test(url)) return <PlayCircle size={16} className="text-red-500" />;
    if (/bilibili\.com/.test(url)) return <Tv size={16} className="text-pink-500" />;
    return <Globe size={16} className="text-slate-500" />;
  };
  const getPlatformLabel = (url: string) => {
    if (/youtube\.com|youtu\.be/.test(url)) return 'YouTube 视频';
    if (/bilibili\.com/.test(url)) return 'Bilibili 视频';
    return '网页内容';
  };
  const isUrlProcessing = (urlJobs: Map<string, any>) =>
    [...urlJobs.values()].some(j => j.status === 'queued' || j.status === 'running');

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="w-[260px] flex flex-col border-r border-slate-200 bg-[#F9F9F9] h-full flex-shrink-0"
    >
      {/* Logo */}
      <motion.div
        layoutId="hero-banner"
        className="relative h-20 border-b border-slate-200 overflow-hidden cursor-pointer flex-shrink-0"
        onClick={() => { if (isWorkspaceMode) {} }}
        title="返回首页"
      >
        <div className="absolute inset-0 pointer-events-none opacity-50">
          <MatrixBackground />
        </div>
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60 hover:bg-black/50 transition-colors">
          <motion.h1
            layoutId="hero-title"
            className="text-2xl font-bold text-white tracking-tighter drop-shadow-md"
          >
            uni-rag
          </motion.h1>
        </div>
      </motion.div>

      {/* 顶部功能分类 */}
      <div className="p-3 flex-1 overflow-y-auto">
        <div className="space-y-1 mb-6">
          <div className="block cursor-pointer" onClick={() => setShowHome(true)}><NavItem icon={<Home size={18} />} label="主页" /></div>
          <NavItem icon={<Search size={18} />} label="发现" onClick={onDiscoverClick} />
          <NavItem icon={<FolderOpen size={18} />} label="我的文件夹" active={!showHome && activeTab === 'files'} />
          <NavItem icon={<Layout size={18} />} label="工作台" />
        </div>

        {/* 来源入口 */}
        <div className="mb-6">
          {/* URL 输入 */}
          <AnimatePresence>
            {showUrlInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-2 overflow-hidden"
              >
                <div className="flex gap-1.5 px-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleUrlIngest(); }}
                    placeholder="粘贴链接..."
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-indigo-400 focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleUrlIngest}
                    disabled={isUploading || !urlInput.trim()}
                    className="px-2.5 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors"
                  >
                    添加
                  </button>
                  <button
                    onClick={() => { setShowUrlInput(false); setUrlInput(''); }}
                    className="px-2 py-1.5 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 上传按钮行 */}
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs font-semibold text-slate-500">来源</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUrlInput(!showUrlInput)}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                title="添加链接"
              >
                <Link2 size={13} />
              </button>
              <motion.label
                className="text-xs text-indigo-600 cursor-pointer hover:underline flex items-center gap-1.5"
                whileTap={{ scale: 0.95 }}
              >
                <AnimatePresence mode="wait">
                  {isUploading ? (
                    <motion.span
                      key="uploading"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-1.5"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      >
                        <Loader2 size={14} />
                      </motion.div>
                      <span>处理中</span>
                    </motion.span>
                  ) : (
                    <motion.span
                      key="upload"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      上传文件
                    </motion.span>
                  )}
                </AnimatePresence>
                <input
                  id="file-upload-input"
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </motion.label>
            </div>
          </div>

          {/* 来源列表 */}
          <div className="space-y-1">
            {files.length === 0 && !isUrlProcessing(urlJobs) ? (
              <div className="px-3 py-2 text-sm text-slate-400">暂无来源</div>
            ) : (
              <>
                {files.map((file, i) => {
                  const fileName = typeof file === 'string' ? file : file.filename || file.name || `File ${i}`;
                  const isUrl = typeof file === 'object' && file.format === 'url';
                  const platform = typeof file === 'object' ? file.platform : '';
                  const icon = isUrl
                    ? getPlatformIcon(platform)
                    : fileName.toLowerCase().endsWith('.pdf')
                      ? <FileText size={16} className="text-red-500" />
                      : <File size={16} className="text-blue-500" />;
                  return (
                    <FileItem
                      key={`src-${i}-${fileName}`}
                      icon={icon}
                      label={fileName}
                      active={false}
                      onClick={() => onFileSelect(fileName)}
                    />
                  );
                })}
                {[...urlJobs.entries()].map(([jobId, job]) => {
                  if (job.status === 'completed') return null;
                  const isRunning = job.status === 'queued' || job.status === 'running';
                  const pct = Math.min(100, Math.round(job.percent || 0));
                  if (isRunning) {
                    return (
                      <div key={`url-${jobId}`} className="px-3 py-2.5 rounded-lg bg-indigo-50/80 border border-indigo-100">
                        <div className="flex items-center gap-2.5">
                          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                            <Loader2 size={16} className="text-indigo-500 shrink-0" />
                          </motion.div>
                          {getPlatformIcon(job.filename)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-100/80 px-1.5 py-0.5 rounded shrink-0">{getPlatformLabel(job.filename)}</span>
                              <span className="truncate text-xs text-indigo-800">{job.message || '正在提取内容...'}</span>
                              <span className="text-[10px] text-indigo-400 shrink-0">{pct}%</span>
                            </div>
                            <div className="h-1 bg-indigo-100 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-indigo-500 rounded-full"
                                initial={{ width: '0%' }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={`url-${jobId}`} className="px-3 py-2.5 rounded-lg bg-red-50/80 border border-red-100">
                      <div className="flex items-center gap-2.5">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="shrink-0"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-red-600 truncate block">{job.error || '处理失败，请重试'}</span>
                          <span className="text-[10px] text-red-400">点击可重新提交链接</span>
                        </div>
                        <button
                          onClick={() => { setShowUrlInput(true); setUrlInput(job.filename || ''); }}
                          className="text-[10px] text-red-500 hover:text-red-700 underline shrink-0"
                        >
                          重试
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 底部设置 */}
      <div className="p-3 border-t border-slate-200">
        <NavItem icon={<Settings size={18} />} label="设置" onClick={onSettingsClick} />
      </div>
    </motion.div>
  );
}
