import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getFontScale } from '../storage';

function resolveInitialFontScale() {
  try {
    return getFontScale();
  } catch (e) {
    return 1.0;
  }
}

export const useUIStore = create(
  persist(
    (set, get) => ({
      // State
      sidebarCollapsed: false,
      fontScale: resolveInitialFontScale(),
      showFontSlider: false,
      activeToolTab: 'chat', // 'chat' | 'pdf' | 'summary' | 'flashcard' | 'mindmap'
      rightToolTab: 'navigator', // 'chat' | 'flashcard' | 'navigator' | 'artifacts'
      workspaceSplitRatio: 0.58,

      // Actions - setters
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setFontScale: (fontScale) => set({ fontScale }),
      setShowFontSlider: (showFontSlider) => set({ showFontSlider }),
      setActiveToolTab: (activeToolTab) => set({ activeToolTab }),
      setRightToolTab: (rightToolTab) => set({ rightToolTab }),
      setWorkspaceSplitRatio: (workspaceSplitRatio) =>
        set({ workspaceSplitRatio: Math.min(0.72, Math.max(0.38, workspaceSplitRatio)) }),

      // Actions - computed / helpers
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      toggleFontSlider: () =>
        set((state) => ({ showFontSlider: !state.showFontSlider })),

      increaseFontScale: (step = 0.1) =>
        set((state) => ({
          fontScale: Math.min(1.5, state.fontScale + step),
        })),

      decreaseFontScale: (step = 0.1) =>
        set((state) => ({
          fontScale: Math.max(0.8, state.fontScale - step),
        })),

      getEffectiveFontSize: (baseSize = 14) => {
        return baseSize * get().fontScale;
      },
    }),
    {
      name: 'ai-chat-ui-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        fontScale: state.fontScale,
        activeToolTab: state.activeToolTab,
        rightToolTab: state.rightToolTab,
        workspaceSplitRatio: state.workspaceSplitRatio,
      }),
    }
  )
);
