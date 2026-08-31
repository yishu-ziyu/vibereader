import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import "katex/dist/katex.min.css";
import {
  Image as ImageIcon,
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { LandingPage } from './components/LandingPage';
import { WelcomeGuide } from './components/WelcomeGuide';
import { WhyUniRag } from './components/WhyUniRag';
import { ChatPanel } from './components/ChatPanel';
import { SettingsModal } from './components/SettingsModal';
import { DiscoverOverlay } from './components/DiscoverOverlay';
import { DocumentPreview } from './components/DocumentPreview';
import { EmptyState } from './components/EmptyState';
import { ToolBtn } from './components/ui';

function App() {
  const [isWorkspaceMode, setIsWorkspaceMode] = useState(false);
  const [showHome, setShowHome] = useState(false);
  const [activeTab, setActiveTab] = useState('files');
  const [files, setFiles] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [documentContent, setDocumentContent] = useState<string>('');
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [sessionId] = useState<string>(() => {
    const stored = localStorage.getItem('uni-rag-session-id');
    if (stored) return stored;
    const newId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('uni-rag-session-id', newId);
    return newId;
  });
  const [messages, setMessages] = useState<{role: 'user'|'assistant', text: string, citations?: any[]}[]>([
    { role: 'assistant', text: '你好！我是你的 AI 助手，已阅读选中的文档。你可以向我提问，或者生成测验、总结。' }
  ]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('uni-rag-api-key') || '');
  const [showDiscover, setShowDiscover] = useState(false);
  const [providers, setProviders] = useState<{id: string, name: string, model: string}[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>(() => localStorage.getItem('uni-rag-provider') || 'minimax');
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlJobs, setUrlJobs] = useState<Map<string, {status: string; percent: number; message: string; filename: string; error?: string}>>(new Map());

  useEffect(() => {
    localStorage.setItem('uni-rag-provider', selectedProvider);
  }, [selectedProvider]);

  useEffect(() => {
    fetch('/api/providers')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.providers)) {
          setProviders(data.providers);
          const valid = data.providers.find((p: any) => p.id === selectedProvider);
          if (!valid) {
            setSelectedProvider(data.providers[0]?.id || 'minimax');
          }
        }
      })
      .catch(() => {});
  }, []);

  const fetchFiles = () => {
    fetch('/api/sources')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.documents)) {
          setFiles(data.documents);
        } else if (Array.isArray(data)) {
          setFiles(data);
        } else if (data && Array.isArray(data.files)) {
          setFiles(data.files);
        }
      })
      .catch(err => console.error('Failed to fetch files:', err));
  };

  const fetchDocumentContent = async (filename: string) => {
    setIsLoadingDoc(true);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(filename)}/chunks`);
      if (!res.ok) throw new Error('获取文档内容失败');
      const data = await res.json();
      const text = data.chunks?.map((c: any) => c.text).join('\n\n') || '';
      setDocumentContent(text);
    } catch (err: any) {
      console.error('Fetch document error:', err);
      setDocumentContent('');
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const handleFileSelect = (filename: string) => {
    setSelectedFile(filename);
    fetchDocumentContent(filename);
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        throw new Error(`上传失败: ${res.status}`);
      }
      // 上传成功后刷新文件列表
      fetchFiles();
    } catch (err: any) {
      console.error('File upload error:', err);
      alert(err.message || '上传文件时发生错误');
    } finally {
      setIsUploading(false);
      // 清空 input，以便可以重复上传同一文件
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleUrlIngest = async () => {
    const url = urlInput.trim();
    if (!url || isUploading) return;

    setIsUploading(true);
    setUrlInput('');
    // 不立即收起输入框，让 job card 能渲染

    try {
      const res = await fetch('/api/ingest/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        let errText = '';
        try { errText = await res.text(); } catch(e) {}
        throw new Error(errText || `请求失败: ${res.status}`);
      }
      const data = await res.json();
      const jobId = data.job_id;

      setUrlJobs(prev => {
        const next = new Map(prev);
        next.set(jobId, {
          status: 'queued',
          percent: 1,
          message: '已收到链接，准备开始提取。',
          filename: url,
        });
        return next;
      });

      // 首轮轮询后再收起输入框
      setShowUrlInput(false);

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/ingest/jobs/${jobId}`);
          if (!statusRes.ok) throw new Error('轮询失败');
          const job = await statusRes.json();

          setUrlJobs(prev => {
            const next = new Map(prev);
            if (job.status === 'completed' || job.status === 'failed') {
              clearInterval(pollInterval);
              if (job.status === 'completed') {
                next.set(jobId, {
                  status: job.status,
                  percent: job.percent,
                  message: job.message,
                  filename: job.filename || url,
                });
                fetchFiles();
                // 成功状态延迟 2 秒后清理
                setTimeout(() => {
                  setUrlJobs(p => {
                    const n = new Map(p);
                    n.delete(jobId);
                    return n;
                  });
                }, 2000);
              } else {
                // 失败状态保持可见，等用户再次提交时再清除
                next.set(jobId, {
                  status: job.status,
                  percent: job.percent,
                  message: job.message,
                  filename: job.filename || url,
                  error: job.error,
                });
              }
              return next;
            }
            next.set(jobId, {
              status: job.status,
              percent: job.percent,
              message: job.message,
              filename: job.filename || url,
            });
            return next;
          });
        } catch {
          clearInterval(pollInterval);
        }
      }, 1500);

    } catch (err: any) {
      alert(err.message || '链接入站时发生错误');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!query.trim() || isLoading) return;

    const userMessage = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    let style = 'casual';
    if (activeTab === 'notes') style = 'concise';
    else if (activeTab === 'flashcards') style = 'academic';
    else if (activeTab === 'quiz') style = 'concise';
    else if (activeTab === 'graph') style = 'academic';

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage, style, session_id: sessionId, provider: selectedProvider })
      });

      if (!res.ok) {
        let errText = '';
        try { errText = await res.text(); } catch(e) {}
        throw new Error(errText || `请求失败: ${res.status}`);
      }

      const data = await res.json();
      const answer = data.answer || data.response || data.text || JSON.stringify(data);
      const citations = data.citations || [];
      setMessages(prev => [...prev, { role: 'assistant', text: answer, citations }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `抱歉，模型调用失败。这通常是因为未配置该模型的 API Key，或网络问题。\n\n**错误详情**：\`${err.message || err}\`\n\n💡 **提示**：请点击左下角「设置」检查是否已正确配置。`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeSend = async (mode: string) => {
    if (!selectedFile) return;
    setIsLoading(true);
    try {
      const body: any = {
        question: documentContent.slice(0, 3000),
        mode,
        session_id: sessionId,
        provider: selectedProvider
      };
      if (apiKey) body.api_key = apiKey;
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`请求失败: ${res.status}`);
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.answer || '',
        citations: mode === 'chat' ? (data.citations || []) : []
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `抱歉，模型调用失败。\n\n**错误详情**：\`${err.message}\`\n\n💡 **提示**：请点击左下角「设置」检查 API Key。`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const hasFiles = files.length > 0 || urlJobs.size > 0;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-slate-800 font-sans relative">
      <AnimatePresence mode="wait">
        {!isWorkspaceMode ? (
          <LandingPage onEnter={() => setIsWorkspaceMode(true)} />
        ) : (
          <motion.div
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-screen w-full relative z-10"
          >
            <Sidebar
              isWorkspaceMode={isWorkspaceMode}
              showHome={showHome}
              setShowHome={setShowHome}
              activeTab={activeTab}
              files={files}
              urlInput={urlInput}
              setUrlInput={setUrlInput}
              showUrlInput={showUrlInput}
              setShowUrlInput={setShowUrlInput}
              urlJobs={urlJobs}
              isUploading={isUploading}
              handleUrlIngest={handleUrlIngest}
              handleFileUpload={handleFileUpload}
              onFileSelect={handleFileSelect}
              onSettingsClick={() => setSettingsOpen(true)}
              onDiscoverClick={() => setShowDiscover(true)}
            />

            {/* 中栏 - 预览 (flex-1) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex-1 flex flex-col bg-white h-full relative border-r border-slate-200 min-w-0"
            >
              {showHome ? (
                <WelcomeGuide onDismiss={() => setShowHome(false)} />
              ) : (
                <div className="flex flex-col h-full">
                  {/* 工具条 */}
                  <div className="h-14 border-b border-slate-200 flex items-center px-4 justify-center bg-white shrink-0">
                    <div className="flex bg-slate-100 rounded-lg p-1 space-x-1">
                      <ToolBtn label="原版" active />
                      {hasFiles && (
                        <>
                          <ToolBtn label="翻译" onClick={() => handleModeSend('translate')} />
                          <ToolBtn label="文件转信息图" icon={<ImageIcon size={14} className="mr-1" />} />
                        </>
                      )}
                    </div>
                  </div>

                  {selectedFile ? (
                    <DocumentPreview
                      selectedFile={selectedFile}
                      documentContent={documentContent}
                      isLoadingDoc={isLoadingDoc}
                      onClose={() => { setSelectedFile(null); setDocumentContent(''); }}
                    />
                  ) : (
                    <EmptyState onUploadClick={() => document.getElementById('file-upload-input')?.click()} />
                  )}
                </div>
              )}
            </motion.div>

            {/* 右栏 - 聊天与工具 (400px) */}
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="w-[400px] flex flex-col bg-white h-full flex-shrink-0"
            >
              {showHome ? (
                <WhyUniRag />
              ) : (
                <ChatPanel
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  messages={messages}
                  isLoading={isLoading}
                  hasFiles={hasFiles}
                  providers={providers}
                  selectedProvider={selectedProvider}
                  query={query}
                  setQuery={setQuery}
                  onSend={handleSend}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        providers={providers}
        selectedProvider={selectedProvider}
        onProviderChange={setSelectedProvider}
        apiKey={apiKey}
        onApiKeyChange={(key) => { setApiKey(key); localStorage.setItem('uni-rag-api-key', key); }}
      />

      <DiscoverOverlay
        open={showDiscover}
        onClose={() => setShowDiscover(false)}
        selectedFile={selectedFile}
        documentContent={documentContent}
        selectedProvider={selectedProvider}
      />
    </div>
  );
}

export default App;
