import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function generateId() {
  return `fc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createDefaultDeck(paperTitle = '') {
  return {
    id: generateId(),
    title: paperTitle || 'Default Deck',
    cards: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const useFlashcardStore = create(
  persist(
    (set, get) => ({
      // State
      decks: [],
      currentDeckId: null,
      currentCardIndex: 0,
      showAnswer: false,
      studyMode: false,

      setDecks: (decks) => {
        const nextDecks = Array.isArray(decks) ? decks : [];
        set((state) => {
          const currentDeckExists = nextDecks.some((deck) => deck.id === state.currentDeckId);
          return {
            decks: nextDecks,
            currentDeckId: currentDeckExists ? state.currentDeckId : null,
            currentCardIndex: 0,
            showAnswer: false,
            studyMode: false,
          };
        });
      },

      // Actions - deck management
      addDeck: (title) => {
        const deck = createDefaultDeck(title);
        set((state) => ({
          decks: [...state.decks, deck],
          currentDeckId: deck.id,
          currentCardIndex: 0,
          showAnswer: false,
        }));
        return deck.id;
      },

      removeDeck: (deckId) => {
        set((state) => {
          const filtered = state.decks.filter((d) => d.id !== deckId);
          const nextDeckId =
            state.currentDeckId === deckId
              ? filtered.length > 0
                ? filtered[0].id
                : null
              : state.currentDeckId;
          return {
            decks: filtered,
            currentDeckId: nextDeckId,
            currentCardIndex: 0,
            showAnswer: false,
          };
        });
      },

      selectDeck: (deckId) => {
        set({ currentDeckId: deckId, currentCardIndex: 0, showAnswer: false });
      },

      // Actions - card management
      addCard: (deckId, front, back) => {
        const card = {
          id: generateId(),
          front,
          back,
          known: false,
          unknown: false,
          createdAt: Date.now(),
        };
        set((state) => ({
          decks: state.decks.map((d) =>
            d.id === deckId
              ? { ...d, cards: [...d.cards, card], updatedAt: Date.now() }
              : d
          ),
        }));
        return card.id;
      },

      removeCard: (deckId, cardId) => {
        set((state) => ({
          decks: state.decks.map((d) =>
            d.id === deckId
              ? {
                  ...d,
                  cards: d.cards.filter((c) => c.id !== cardId),
                  updatedAt: Date.now(),
                }
              : d
          ),
        }));
      },

      updateCard: (deckId, cardId, updates) => {
        set((state) => ({
          decks: state.decks.map((d) =>
            d.id === deckId
              ? {
                  ...d,
                  cards: d.cards.map((c) =>
                    c.id === cardId ? { ...c, ...updates } : c
                  ),
                  updatedAt: Date.now(),
                }
              : d
          ),
        }));
      },

      // Actions - study navigation
      nextCard: () => {
        const { currentDeck, currentCardIndex } = get();
        if (!currentDeck || currentDeck.cards.length === 0) return;
        const nextIndex =
          currentCardIndex >= currentDeck.cards.length - 1
            ? 0
            : currentCardIndex + 1;
        set({ currentCardIndex: nextIndex, showAnswer: false });
      },

      prevCard: () => {
        const { currentDeck, currentCardIndex } = get();
        if (!currentDeck || currentDeck.cards.length === 0) return;
        const prevIndex =
          currentCardIndex <= 0
            ? currentDeck.cards.length - 1
            : currentCardIndex - 1;
        set({ currentCardIndex: prevIndex, showAnswer: false });
      },

      toggleShowAnswer: () => {
        set((state) => ({ showAnswer: !state.showAnswer }));
      },

      markCard: (known) => {
        const { currentDeck, currentCardIndex } = get();
        if (!currentDeck) return;
        const card = currentDeck.cards[currentCardIndex];
        if (!card) return;
        get().updateCard(currentDeck.id, card.id, {
          known,
          unknown: !known,
        });
      },

      setStudyMode: (studyMode) => {
        set({ studyMode, currentCardIndex: 0, showAnswer: false });
      },

      resetProgress: (deckId) => {
        set((state) => ({
          decks: state.decks.map((d) =>
            d.id === deckId
              ? {
                  ...d,
                  cards: d.cards.map((c) => ({
                    ...c,
                    known: false,
                    unknown: false,
                  })),
                }
              : d
          ),
        }));
      },

      // Actions - batch generation
      generateCards: (deckId, cardsData) => {
        set((state) => ({
          decks: state.decks.map((d) =>
            d.id === deckId
              ? {
                  ...d,
                  cards: [
                    ...d.cards,
                    ...cardsData.map((cd) => ({
                      id: generateId(),
                      front: cd.front,
                      back: cd.back,
                      known: false,
                      unknown: false,
                      createdAt: Date.now(),
                    })),
                  ],
                  updatedAt: Date.now(),
                }
              : d
          ),
        }));
      },
    }),
    {
      name: 'ai-chat-flashcard-store',
      partialize: (state) => ({
        decks: state.decks,
        currentDeckId: state.currentDeckId,
      }),
    }
  )
);

// Selector helper (computed outside store to avoid serialization issues)
export function useCurrentDeck() {
  const { decks, currentDeckId } = useFlashcardStore();
  return decks.find((d) => d.id === currentDeckId) || null;
}

export function useCurrentCard() {
  const deck = useCurrentDeck();
  const { currentCardIndex } = useFlashcardStore();
  if (!deck || deck.cards.length === 0) return null;
  return deck.cards[currentCardIndex] || null;
}
