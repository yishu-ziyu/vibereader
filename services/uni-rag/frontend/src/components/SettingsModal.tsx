export function SettingsModal({ open, onClose, providers, selectedProvider, onProviderChange, apiKey, onApiKeyChange }: {
  open: boolean;
  onClose: () => void;
  providers: {id: string, name: string, model: string}[];
  selectedProvider: string;
  onProviderChange: (id: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">设置</h3>
        <label className="block mb-4">
          <span className="text-sm text-slate-600">模型</span>
          <select value={selectedProvider} onChange={e => onProviderChange(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
            ))}
          </select>
        </label>
        <label className="block mb-4">
          <span className="text-sm text-slate-600">API Key（选填，留空则用服务端默认配置）</span>
          <input type="password" value={apiKey} onChange={e => onApiKeyChange(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="输入你的 API Key" />
        </label>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">关闭</button>
        </div>
      </div>
    </div>
  );
}
