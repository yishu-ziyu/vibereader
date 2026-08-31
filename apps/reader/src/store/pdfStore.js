import { create } from 'zustand';

export const usePdfStore = create((set, get) => ({
  // State
  pdfText: null,
  pdfPages: 0,
  pdfParsing: false,
  vibeResult: null,
  pdfFile: null, // File or ArrayBuffer for visual rendering

  // Actions - setters
  setPdfText: (pdfText) => set({ pdfText }),
  setPdfPages: (pdfPages) => set({ pdfPages }),
  setPdfParsing: (pdfParsing) => set({ pdfParsing }),
  setVibeResult: (vibeResult) => set({ vibeResult }),
  setPdfFile: (pdfFile) => set({ pdfFile }),

  // Actions - computed / helpers
  setPdfData: (text, pages) => set({ pdfText: text, pdfPages: pages }),

  clearPdf: () =>
    set({
      pdfText: null,
      pdfPages: 0,
      pdfParsing: false,
      vibeResult: null,
      pdfFile: null,
    }),

  startParsing: () => set({ pdfParsing: true }),

  finishParsing: (text, pages) =>
    set({
      pdfText: text,
      pdfPages: pages,
      pdfParsing: false,
    }),

  failParsing: () => set({ pdfParsing: false }),

  hasPdf: () => {
    return !!get().pdfText;
  },

  getPdfSummary: () => {
    const { pdfText, pdfPages } = get();
    if (!pdfText) return null;
    return {
      pages: pdfPages,
      textLength: pdfText.length,
      hasContent: pdfText.length > 0,
    };
  },
}));
