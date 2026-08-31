import { create } from 'zustand';

export const useConversationStore = create((set, get) => ({
  // State
  messages: [],
  currentSessionId: null,
  sessions: [],
  loading: false,
  historyLoaded: false,

  // Actions - setters（支持 updater 函数，与 React setState 行为一致）
  setMessages: (messages) => set((state) => ({
    messages: typeof messages === 'function' ? messages(state.messages) : messages,
  })),
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
  setSessions: (sessions) => set((state) => ({
    sessions: typeof sessions === 'function' ? sessions(state.sessions) : sessions,
  })),
  setLoading: (loading) => set({ loading }),
  setHistoryLoaded: (historyLoaded) => set({ historyLoaded }),

  // Actions - computed / helpers
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  addMessages: (...messages) =>
    set((state) => ({ messages: [...state.messages, ...messages] })),

  updateMessage: (messageId, updater) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? typeof updater === 'function'
            ? updater(msg)
            : { ...msg, ...updater }
          : msg
      ),
    })),

  removeMessage: (messageId) =>
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== messageId),
    })),

  clearMessages: () => set({ messages: [] }),

  getMessageById: (messageId) => {
    return get().messages.find((msg) => msg.id === messageId);
  },

  getCurrentSession: () => {
    const { sessions, currentSessionId } = get();
    return sessions.find((s) => s.sessionId === currentSessionId);
  },

  getSessionTitle: (session) => {
    if (!session) return '';
    if (session.title) return session.title;
    return `Session ${session.sessionId.slice(-6)}`;
  },
}));
