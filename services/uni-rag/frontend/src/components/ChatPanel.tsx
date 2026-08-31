import { useState } from 'react';
import { MessageSquare, BookOpen, Layers, HelpCircle, Network, Send, Wand2, ChevronDown } from 'lucide-react';
import { TabItem } from './ui';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

type Message = { role: 'user'|'assistant', text: string, citations?: any[] };

export function ChatPanel({
  activeTab,
  setActiveTab,
  messages,
  isLoading,
  hasFiles,
  providers,
  selectedProvider,
  query,
  setQuery,
  onSend,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  messages: Message[];
  isLoading: boolean;
  hasFiles: boolean;
  providers: {id: string, name: string, model: string}[];
  selectedProvider: string;
  query: string;
  setQuery: (v: string) => void;
  onSend: () => void;
}) {
  const [expanded, setExpanded] = useState<number[]>([]);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="h-14 border-b border-slate-200 flex items-center px-2 shrink-0 overflow-x-auto no-scrollbar">
        <TabItem active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare size={16} />} label="聊天" />
        {hasFiles && (
          <>
            <TabItem active={activeTab === 'notes'} onClick={() => setActiveTab('notes')} icon={<BookOpen size={16} />} label="笔记" />
            <TabItem active={activeTab === 'flashcards'} onClick={() => setActiveTab('flashcards')} icon={<Layers size={16} />} label="闪卡" />
            <TabItem active={activeTab === 'quiz'} onClick={() => setActiveTab('quiz')} icon={<HelpCircle size={16} />} label="测验" />
            <TabItem active={activeTab === 'graph'} onClick={() => setActiveTab('graph')} icon={<Network size={16} />} label="知识图谱" />
          </>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-white">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[85%]'}`}>
            <div
              className={
                msg.role === 'user'
                  ? "bg-indigo-50 border border-indigo-100 rounded-2xl rounded-tr-sm p-3 text-sm text-indigo-900"
                  : "bg-slate-100 rounded-2xl rounded-tl-sm p-3 text-sm text-slate-700 leading-relaxed markdown-content"
              }
            >
              {msg.role === 'user' ? (
                msg.text
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {msg.text}
                </ReactMarkdown>
              )}
            </div>
            {msg.citations && msg.citations.length > 0 && (
              <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200 self-start w-full">
                <div className="font-semibold mb-1 text-slate-600 flex items-center">
                  <BookOpen size={12} className="mr-1" />
                  来源参考
                </div>
                <ul className="space-y-2 mt-2">
                  {msg.citations.map((c: any, i: number) => {
                    const isOpen = expanded.includes(i);
                    const toggle = () => setExpanded(prev => isOpen ? prev.filter(x => x !== i) : [...prev, i]);
                    return (
                      <li key={i} className="bg-white p-2 rounded border border-slate-100 shadow-sm">
                        <div className="font-medium text-indigo-600 mb-0.5 flex justify-between items-center cursor-pointer select-none" onClick={toggle}>
                          <span className="truncate pr-2">{c.source || '未知文档'}</span>
                          <span className="flex items-center gap-1.5">
                            {c.page && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 whitespace-nowrap">第 {c.page} 页</span>}
                            <ChevronDown size={12} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </span>
                        </div>
                        {isOpen && (
                          <div className="text-slate-500 leading-relaxed mt-1.5 pt-1.5 border-t border-slate-100">"{c.text}"</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="bg-slate-100 rounded-2xl rounded-tl-sm p-3 text-sm max-w-[85%] self-start text-slate-500">
            处理中...
          </div>
        )}

        {/* Tab-specific content */}
        {activeTab === 'flashcards' && messages.length > 1 && renderCardsTab(messages)}
        {activeTab === 'quiz' && messages.length > 1 && renderQuizTab(messages)}
        {activeTab === 'graph' && messages.length > 1 && renderGraphTab(messages)}
      </div>

      {/* 底部输入框与模型切换 */}
      <div className="p-4 border-t border-slate-100 bg-white">
        <div className="mb-2 flex items-center">
          <button className="flex items-center text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
            <Wand2 size={12} className="mr-1 text-indigo-500" />
            {providers.find(p => p.id === selectedProvider)?.name || selectedProvider}
            <ChevronDown size={12} className="ml-1 opacity-70" />
          </button>
        </div>
        <div className="relative flex items-end border border-slate-300 rounded-xl bg-white shadow-sm focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all overflow-hidden">
          <textarea
            className="w-full max-h-32 min-h-[44px] py-3 pl-4 pr-12 bg-transparent text-sm resize-none outline-none"
            placeholder="向文档提问..."
            rows={1}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button
            onClick={onSend}
            disabled={isLoading || !query.trim()}
            className="absolute right-2 bottom-2 p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="mt-2 text-center text-[10px] text-slate-400">
          AI 可能会犯错，请核对重要信息。
        </div>
      </div>
    </div>
  );
}

function renderCardsTab(messages: Message[]) {
  try {
    const cards = JSON.parse(messages[messages.length - 1].text);
    if (Array.isArray(cards)) {
      return (
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card: any, i: number) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 text-sm">
              <div className="font-medium text-slate-700 mb-1">{card.question || card.q || '卡片'}</div>
              <div className="text-slate-500 text-xs">{card.answer || card.a || ''}</div>
            </div>
          ))}
        </div>
      );
    }
  } catch {}
  return null;
}

function renderQuizTab(messages: Message[]) {
  try {
    const quiz = JSON.parse(messages[messages.length - 1].text);
    if (Array.isArray(quiz)) {
      return (
        <div className="space-y-3">
          {quiz.map((q: any, i: number) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 text-sm">
              <div className="font-medium text-slate-700 mb-2">{q.question || q.q}</div>
              <div className="space-y-1">
                {(q.options || q.choices || []).map((opt: string, j: number) => (
                  <div key={j} className={`px-2 py-1 rounded text-xs ${j === (q.correct ?? q.answer) ? 'bg-green-50 text-green-700 font-medium' : 'text-slate-500'}`}>
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
  } catch {}
  return null;
}

function renderGraphTab(messages: Message[]) {
  try {
    const graphData = JSON.parse(messages[messages.length - 1].text);
    const nodes = graphData.nodes || graphData.entities || [];
    const edges = graphData.edges || graphData.relations || [];
    if (nodes.length > 0) {
      const cx = 200, cy = 150;
      const radius = Math.min(cx, cy) - 20;
      const positions = nodes.map((_: any, i: number) => ({
        x: cx + radius * Math.cos(2 * Math.PI * i / nodes.length - Math.PI / 2),
        y: cy + radius * Math.sin(2 * Math.PI * i / nodes.length - Math.PI / 2)
      }));
      return (
        <div className="bg-white border border-slate-200 rounded-lg p-2 overflow-auto">
          <svg viewBox="0 0 400 300" className="w-full max-w-md mx-auto">
            {edges.map((e: any, i: number) => {
              const srcIdx = nodes.findIndex((n: any) => n.id === e.source || n === e.source);
              const tgtIdx = nodes.findIndex((n: any) => n.id === e.target || n === e.target);
              if (srcIdx >= 0 && tgtIdx >= 0 && positions[srcIdx] && positions[tgtIdx]) {
                return <line key={i} x1={positions[srcIdx].x} y1={positions[srcIdx].y} x2={positions[tgtIdx].x} y2={positions[tgtIdx].y} stroke="#94a3b8" strokeWidth="1.5" />;
              }
              return null;
            })}
            {nodes.map((n: any, i: number) => {
              const label = n.name || n.label || n.id || '';
              const short = String(label).slice(0, 6);
              if (!positions[i]) return null;
              return (
                <g key={i}>
                  <circle cx={positions[i].x} cy={positions[i].y} r="22" fill="#eef2ff" stroke="#6366f1" strokeWidth="1.5" />
                  <text x={positions[i].x} y={positions[i].y + 1} textAnchor="middle" fontSize="10" fill="#334155" dominantBaseline="middle">{short}</text>
                </g>
              );
            })}
          </svg>
        </div>
      );
    }
  } catch {}
  return null;
}
