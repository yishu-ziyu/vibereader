import { useState, useEffect } from 'react';

export function DiscoverPanel({ documentContent, selectedProvider }: { documentContent: string; selectedProvider: string }) {
  const [questions, setQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!documentContent) return;
    setLoading(true);
    fetch('/api/suggest-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: documentContent.slice(0, 5000), provider: selectedProvider }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && data.questions) setQuestions(data.questions); })
      .finally(() => setLoading(false));
  }, [documentContent]);

  if (loading) return <div className="text-sm text-slate-500 py-4">正在分析文档...</div>;
  if (questions.length === 0) return <p className="text-sm text-slate-500">暂无可推荐问题</p>;

  return (
    <ul className="space-y-2">
      {questions.map((q, i) => (
        <li key={i} className="bg-slate-50 p-2.5 rounded-lg text-sm text-slate-700 border border-slate-100">{q}</li>
      ))}
    </ul>
  );
}
