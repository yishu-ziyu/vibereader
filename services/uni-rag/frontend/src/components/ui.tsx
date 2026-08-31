import type { ReactNode } from 'react'

export function NavItem({ icon, label, active = false, onClick }: { icon: ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${active ? 'bg-slate-200/60 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-200/40'}`}>
      <div className={active ? 'text-indigo-600' : 'text-slate-500'}>
        {icon}
      </div>
      <span>{label}</span>
    </div>
  );
}

export function FileItem({ icon, label, active = false, onClick }: { icon: ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${active ? 'bg-indigo-50 border border-indigo-100 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-200/40 border border-transparent'}`}>
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

export function ToolBtn({ label, active = false, icon = null, onClick }: { label: string, active?: boolean, icon?: ReactNode, onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
      {icon}
      {label}
    </button>
  );
}

export function TabItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
    >
      {icon}
      {label}
    </button>
  );
}
