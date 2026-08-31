import React, { useState, useCallback, useEffect } from 'react';
import {
  Button,
  List,
  Card,
  Modal,
  Input,
  Tag,
  Space,
  Empty,
  message as antMessage,
  Progress,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  BookOutlined,
  RobotOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Flashcard } from './Flashcard';
import { useFlashcardStore, useCurrentDeck } from './store';
import { usePdfStore } from './store';
import { t } from './i18n';
import aiService from './aiService';
import {
  isPersistentStorageAvailable,
  listPersistentFlashcardDecks,
  savePersistentFlashcardDecks,
} from './services/persistentStorage';

/**
 * FlashcardDeck - Deck management UI + study mode.
 *
 * Props:
 *   - documentId: current document id for persisted decks
 *   - style: CSS style object
 */
export function FlashcardDeck({ documentId, style = {} }) {
  const {
    decks,
    currentDeckId,
    studyMode,
    addDeck,
    removeDeck,
    selectDeck,
    setStudyMode,
    addCard,
    generateCards,
    resetProgress,
    setDecks,
  } = useFlashcardStore();

  const currentDeck = useCurrentDeck();
  const { pdfText } = usePdfStore();

  const [showNewDeckModal, setShowNewDeckModal] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [newCardFront, setNewCardFront] = useState('');
  const [newCardBack, setNewCardBack] = useState('');
  const [loadedDocumentId, setLoadedDocumentId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadedDocumentId(null);

    if (!documentId || !isPersistentStorageAvailable()) {
      return () => {
        cancelled = true;
      };
    }

    listPersistentFlashcardDecks(documentId)
      .then((records) => {
        if (cancelled) return;
        setDecks(records || []);
        setLoadedDocumentId(documentId);
      })
      .catch((error) => {
        console.warn('[FlashcardDeck] Failed to load persisted decks:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, setDecks]);

  useEffect(() => {
    if (!documentId || loadedDocumentId !== documentId || !isPersistentStorageAvailable()) {
      return;
    }

    savePersistentFlashcardDecks(documentId, decks).catch((error) => {
      console.warn('[FlashcardDeck] Failed to save persisted decks:', error);
    });
  }, [decks, documentId, loadedDocumentId]);

  /* ---------- deck management ---------- */

  const handleCreateDeck = useCallback(() => {
    if (!newDeckTitle.trim()) return;
    addDeck(newDeckTitle.trim());
    setNewDeckTitle('');
    setShowNewDeckModal(false);
  }, [newDeckTitle, addDeck]);

  const handleDeleteDeck = useCallback(
    (deckId) => {
      Modal.confirm({
        title: t('ai-chat-flashcard-delete-deck-title', null, 'Delete deck?'),
        content: t(
          'ai-chat-flashcard-delete-deck-body',
          null,
          'This will delete all cards in this deck.'
        ),
        okText: t('general-cancel', null, 'Cancel'),
        cancelText: t('ai-chat-button-delete', null, 'Delete'),
        okButtonProps: { type: 'default' },
        cancelButtonProps: { danger: true },
        onCancel: () => removeDeck(deckId),
      });
    },
    [removeDeck]
  );

  /* ---------- AI generation ---------- */

  const handleGenerateFromPaper = useCallback(async () => {
    if (!pdfText) {
      antMessage.warning(t('ai-chat-no-pdf-context'));
      return;
    }
    if (!currentDeck) {
      antMessage.warning(t('ai-chat-flashcard-select-deck', null, 'Select a deck first'));
      return;
    }

    setGenerating(true);
    try {
      const prompt = `请基于以下论文内容，生成 5-8 张学习卡片（flashcards）。每张卡片包含一个问题（正面）和对应的答案（背面）。

论文内容（前3000字）：
${pdfText.slice(0, 3000)}

请严格按以下格式输出，每条卡片用 --- 分隔：
Q: <问题>
A: <答案>
---`;

      let fullText = '';
      await aiService.chatStream(
        prompt,
        ({ done, content, fullMessage }) => {
          if (!done && content) {
            fullText = fullMessage;
          }
        },
        { includeHistory: false, systemPrompt: null }
      );

      // Parse cards
      const cardsData = [];
      const blocks = fullText.split(/---+/);
      for (const block of blocks) {
        const qMatch = block.match(/Q[:：]\s*([\s\S]*?)(?=A[:：]|$)/i);
        const aMatch = block.match(/A[:：]\s*([\s\S]*)/i);
        if (qMatch && aMatch) {
          cardsData.push({
            front: qMatch[1].trim(),
            back: aMatch[1].trim(),
          });
        }
      }

      if (cardsData.length > 0) {
        generateCards(currentDeck.id, cardsData);
        antMessage.success(
          t('ai-chat-flashcard-generated', { count: cardsData.length }, `Generated ${cardsData.length} cards`)
        );
      } else {
        antMessage.warning(t('ai-chat-flashcard-gen-failed', null, 'Could not parse cards'));
      }
    } catch (e) {
      antMessage.error(t('ai-chat-flashcard-gen-error', null, 'Generation failed'));
    } finally {
      setGenerating(false);
    }
  }, [pdfText, currentDeck, generateCards]);

  /* ---------- manual card add ---------- */

  const handleAddCard = useCallback(() => {
    if (!newCardFront.trim() || !newCardBack.trim() || !currentDeck) return;
    addCard(currentDeck.id, newCardFront.trim(), newCardBack.trim());
    setNewCardFront('');
    setNewCardBack('');
    setShowAddCardModal(false);
  }, [newCardFront, newCardBack, currentDeck, addCard]);

  /* ---------- study mode ---------- */

  const handleStartStudy = useCallback(() => {
    if (!currentDeck || currentDeck.cards.length === 0) {
      antMessage.warning(t('ai-chat-flashcard-empty-deck', null, 'Deck is empty'));
      return;
    }
    setStudyMode(true);
  }, [currentDeck, setStudyMode]);

  const handleExitStudy = useCallback(() => {
    setStudyMode(false);
  }, [setStudyMode]);

  /* ---------- render: study mode ---------- */

  if (studyMode && currentDeck) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: 'var(--material-sidepane)',
          ...style,
        }}
      >
        {/* Study header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--fill-quinary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={handleExitStudy}
          >
            {t('ai-chat-flashcard-back', null, 'Back')}
          </Button>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fill-primary)' }}>
            {currentDeck.title}
          </span>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => resetProgress(currentDeck.id)}
          >
            {t('ai-chat-flashcard-reset', null, 'Reset')}
          </Button>
        </div>

        <Flashcard />
      </div>
    );
  }

  /* ---------- render: deck list / detail ---------- */

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--material-sidepane)',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--fill-quinary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOutlined style={{ color: 'var(--accent-blue)' }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fill-primary)' }}>
            {t('ai-chat-flashcard-decks', null, 'Flashcards')}
          </span>
        </div>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setShowNewDeckModal(true)}
        >
          {t('ai-chat-flashcard-new-deck', null, 'New Deck')}
        </Button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {!currentDeckId ? (
          /* Deck list */
          <>
            {decks.length === 0 && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ color: 'var(--fill-tertiary)', fontSize: 13 }}>
                    {t('ai-chat-flashcard-no-decks', null, 'No decks yet')}
                  </span>
                }
              />
            )}
            <List
              dataSource={decks}
              renderItem={(deck) => {
                const known = deck.cards.filter((c) => c.known).length;
                const total = deck.cards.length;
                return (
                  <Card
                    size="small"
                    style={{
                      marginBottom: 10,
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: '1px solid var(--fill-quinary)',
                      background: 'var(--material-background)',
                    }}
                    bodyStyle={{ padding: 12 }}
                    onClick={() => selectDeck(deck.id)}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            color: 'var(--fill-primary)',
                          }}
                        >
                          {deck.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--fill-tertiary)', marginTop: 4 }}>
                          {total} {t('ai-chat-flashcard-cards', null, 'cards')} · {known}{' '}
                          {t('ai-chat-flashcard-known', null, 'known')}
                        </div>
                        {total > 0 && (
                          <Progress
                            percent={Math.round((known / total) * 100)}
                            size="small"
                            style={{ width: 120, marginTop: 4 }}
                            showInfo={false}
                          />
                        )}
                      </div>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDeck(deck.id);
                        }}
                      />
                    </div>
                  </Card>
                );
              }}
            />
          </>
        ) : (
          /* Deck detail */
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => selectDeck(null)}>
                {t('ai-chat-flashcard-all-decks', null, 'All Decks')}
              </Button>
              <Space>
                <Button
                  size="small"
                  icon={<RobotOutlined />}
                  loading={generating}
                  onClick={handleGenerateFromPaper}
                >
                  {t('ai-chat-flashcard-generate', null, 'Generate from Paper')}
                </Button>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setShowAddCardModal(true)}
                >
                  {t('ai-chat-flashcard-add-card', null, 'Add Card')}
                </Button>
              </Space>
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--fill-primary)' }}>
                {currentDeck?.title}
              </span>
              <Tag size="small" style={{ marginLeft: 8, fontSize: 11 }}>
                {currentDeck?.cards?.length || 0}{' '}
                {t('ai-chat-flashcard-cards', null, 'cards')}
              </Tag>
            </div>

            {currentDeck?.cards?.length === 0 && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ color: 'var(--fill-tertiary)', fontSize: 13 }}>
                    {t('ai-chat-flashcard-empty-deck', null, 'Deck is empty')}
                  </span>
                }
              />
            )}

            <List
              dataSource={currentDeck?.cards || []}
              renderItem={(card) => (
                <Card
                  size="small"
                  style={{
                    marginBottom: 8,
                    borderRadius: 6,
                    border: '1px solid var(--fill-quinary)',
                    background: 'var(--material-background)',
                  }}
                  bodyStyle={{ padding: 10 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: 13,
                          color: 'var(--fill-primary)',
                        }}
                      >
                        {card.front}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--fill-secondary)',
                          marginTop: 4,
                        }}
                      >
                        {card.back}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {card.known && <Tag color="success" size="small">Known</Tag>}
                      {card.unknown && <Tag color="error" size="small">Unknown</Tag>}
                    </div>
                  </div>
                </Card>
              )}
            />

            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              block
              size="large"
              style={{ marginTop: 16 }}
              onClick={handleStartStudy}
            >
              {t('ai-chat-flashcard-start-study', null, 'Start Study')}
            </Button>
          </>
        )}
      </div>

      {/* New deck modal */}
      <Modal
        title={t('ai-chat-flashcard-new-deck', null, 'New Deck')}
        open={showNewDeckModal}
        onOk={handleCreateDeck}
        onCancel={() => {
          setShowNewDeckModal(false);
          setNewDeckTitle('');
        }}
        okText={t('ai-chat-button-add', null, 'Add')}
        cancelText={t('general-cancel', null, 'Cancel')}
      >
        <Input
          placeholder={t('ai-chat-flashcard-deck-name', null, 'Deck name')}
          value={newDeckTitle}
          onChange={(e) => setNewDeckTitle(e.target.value)}
          onPressEnter={handleCreateDeck}
          autoFocus
        />
      </Modal>

      {/* Add card modal */}
      <Modal
        title={t('ai-chat-flashcard-add-card', null, 'Add Card')}
        open={showAddCardModal}
        onOk={handleAddCard}
        onCancel={() => {
          setShowAddCardModal(false);
          setNewCardFront('');
          setNewCardBack('');
        }}
        okText={t('ai-chat-button-add', null, 'Add')}
        cancelText={t('general-cancel', null, 'Cancel')}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--fill-secondary)' }}>
            {t('ai-chat-flashcard-question', null, 'Question (Front)')}
          </div>
          <Input.TextArea
            rows={2}
            value={newCardFront}
            onChange={(e) => setNewCardFront(e.target.value)}
            placeholder={t('ai-chat-flashcard-front-placeholder', null, 'Enter question...')}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--fill-secondary)' }}>
            {t('ai-chat-flashcard-answer', null, 'Answer (Back)')}
          </div>
          <Input.TextArea
            rows={3}
            value={newCardBack}
            onChange={(e) => setNewCardBack(e.target.value)}
            placeholder={t('ai-chat-flashcard-back-placeholder', null, 'Enter answer...')}
          />
        </div>
      </Modal>
    </div>
  );
}
