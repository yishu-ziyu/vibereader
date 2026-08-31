import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlashcardDeck } from './FlashcardDeck';
import { useFlashcardStore } from './store';

const persistentMock = vi.hoisted(() => ({
  isPersistentStorageAvailable: vi.fn(() => true),
  listPersistentFlashcardDecks: vi.fn(async () => []),
  savePersistentFlashcardDecks: vi.fn(async (_documentId, decks) => decks),
}));

vi.mock('./services/persistentStorage', () => persistentMock);

vi.mock('./aiService', () => ({
  default: {
    chatStream: vi.fn(),
  },
}));

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('FlashcardDeck', () => {
  beforeEach(() => {
    installMatchMedia();
    localStorage.clear();
    persistentMock.isPersistentStorageAvailable.mockReturnValue(true);
    persistentMock.listPersistentFlashcardDecks.mockReset();
    persistentMock.listPersistentFlashcardDecks.mockResolvedValue([]);
    persistentMock.savePersistentFlashcardDecks.mockReset();
    persistentMock.savePersistentFlashcardDecks.mockResolvedValue([]);
    useFlashcardStore.setState({
      decks: [],
      currentDeckId: null,
      currentCardIndex: 0,
      showAnswer: false,
      studyMode: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('loads persisted decks for the active document', async () => {
    persistentMock.listPersistentFlashcardDecks.mockResolvedValue([{
      id: 'deck-1',
      title: 'Methods',
      cards: [{
        id: 'card-1',
        front: 'Question',
        back: 'Answer',
        known: true,
        unknown: false,
      }],
      createdAt: 100,
      updatedAt: 200,
    }]);

    render(<FlashcardDeck documentId="doc-1" />);

    expect(await screen.findByText('Methods')).toBeTruthy();
    expect(screen.getByText(/1 cards/)).toBeTruthy();
    expect(persistentMock.listPersistentFlashcardDecks).toHaveBeenCalledWith('doc-1');
  });

  it('saves deck changes for the active document after loading', async () => {
    render(<FlashcardDeck documentId="doc-1" />);

    await waitFor(() => {
      expect(persistentMock.savePersistentFlashcardDecks).toHaveBeenCalledWith('doc-1', []);
    });
    persistentMock.savePersistentFlashcardDecks.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /New Deck/ }));
    fireEvent.change(screen.getByPlaceholderText('Deck name'), {
      target: { value: 'Concepts' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Deck name'), {
      key: 'Enter',
      code: 'Enter',
    });

    await waitFor(() => {
      expect(persistentMock.savePersistentFlashcardDecks).toHaveBeenCalledWith(
        'doc-1',
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Concepts',
          }),
        ])
      );
    });
  });
});
