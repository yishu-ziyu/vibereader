import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DiscoverPanel } from './DiscoverPanel';

export function DiscoverOverlay({ open, onClose, selectedFile, documentContent, selectedProvider }: {
  open: boolean;
  onClose: () => void;
  selectedFile: string | null;
  documentContent: string;
  selectedProvider: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">发现可能的问题</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl"><X size={20} /></button>
            </div>
            {selectedFile ? (
              <DiscoverPanel documentContent={documentContent} selectedProvider={selectedProvider} />
            ) : (
              <p className="text-sm text-slate-500">请先选择一个文件</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
