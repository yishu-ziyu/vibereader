import React, { useState, useCallback } from 'react';
import { Button, Tag, Progress, Space, Empty } from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  LeftOutlined,
  RightOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import {
  useFlashcardStore,
  useCurrentDeck,
  useCurrentCard,
} from './store';
import { t } from './i18n';

/**
 * Flashcard - A single flip-card component with 3D CSS animation.
 *
 * Props:
 *   - style: CSS style object
 */
export function Flashcard({ style = {} }) {
  const { showAnswer, toggleShowAnswer, nextCard, prevCard, markCard, studyMode } =
    useFlashcardStore();
  const deck = useCurrentDeck();
  const card = useCurrentCard();
  const { currentCardIndex } = useFlashcardStore();

  const [isFlipping, setIsFlipping] = useState(false);

  const total = deck?.cards?.length || 0;
  const knownCount = deck?.cards?.filter((c) => c.known).length || 0;

  const handleFlip = useCallback(() => {
    setIsFlipping(true);
    toggleShowAnswer();
    setTimeout(() => setIsFlipping(false), 300);
  }, [toggleShowAnswer]);

  const handleKnown = useCallback(() => {
    markCard(true);
    setTimeout(() => nextCard(), 200);
  }, [markCard, nextCard]);

  const handleUnknown = useCallback(() => {
    markCard(false);
    setTimeout(() => nextCard(), 200);
  }, [markCard, nextCard]);

  if (!deck || total === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          ...style,
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ color: 'var(--fill-tertiary)', fontSize: 13 }}>
              {t('ai-chat-flashcard-empty', null, 'No cards in this deck')}
            </span>
          }
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px 20px',
        ...style,
      }}
    >
      {/* Progress */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <Tag size="small" style={{ fontSize: 11 }}>
          {currentCardIndex + 1} / {total}
        </Tag>
        {studyMode && (
          <Progress
            percent={Math.round((knownCount / total) * 100)}
            size="small"
            style={{ width: 120, margin: 0 }}
            showInfo={false}
          />
        )}
        <Tag
          size="small"
          color={card?.known ? 'success' : card?.unknown ? 'error' : 'default'}
          style={{ fontSize: 11 }}
        >
          {card?.known
            ? t('ai-chat-flashcard-known', null, 'Known')
            : card?.unknown
              ? t('ai-chat-flashcard-unknown', null, 'Unknown')
              : t('ai-chat-flashcard-new', null, 'New')}
        </Tag>
      </div>

      {/* Card flip container */}
      <div
        style={{
          flex: 1,
          perspective: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            height: 280,
            position: 'relative',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: showAnswer ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              background: 'var(--material-background)',
              border: '1px solid var(--fill-quinary)',
              borderRadius: 12,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: 'var(--fill-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 12,
              }}
            >
              {t('ai-chat-flashcard-question', null, 'Question')}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--fill-primary)',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              {card?.front || t('ai-chat-flashcard-no-content', null, 'No content')}
            </div>
          </div>

          {/* Back */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: 'var(--material-background)',
              border: '1px solid var(--accent-blue)',
              borderRadius: 12,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: 'var(--accent-blue)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 12,
              }}
            >
              {t('ai-chat-flashcard-answer', null, 'Answer')}
            </div>
            <div
              style={{
                fontSize: 15,
                color: 'var(--fill-secondary)',
                textAlign: 'center',
                lineHeight: 1.6,
                overflowY: 'auto',
                maxHeight: '100%',
              }}
            >
              {card?.back || t('ai-chat-flashcard-no-content', null, 'No content')}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Flip button */}
        <Button
          type="primary"
          icon={showAnswer ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          onClick={handleFlip}
          block
          size="large"
        >
          {showAnswer
            ? t('ai-chat-flashcard-hide-answer', null, 'Hide Answer')
            : t('ai-chat-flashcard-show-answer', null, 'Show Answer')}
        </Button>

        {/* Navigation & marking */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<LeftOutlined />} onClick={prevCard} style={{ flex: 1 }}>
            {t('ai-chat-flashcard-prev', null, 'Prev')}
          </Button>
          <Button icon={<RightOutlined />} onClick={nextCard} style={{ flex: 1 }}>
            {t('ai-chat-flashcard-next', null, 'Next')}
          </Button>
        </div>

        {studyMode && showAnswer && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              icon={<CloseCircleOutlined />}
              danger
              onClick={handleUnknown}
              style={{ flex: 1 }}
            >
              {t('ai-chat-flashcard-mark-unknown', null, 'Unknown')}
            </Button>
            <Button
              icon={<CheckCircleOutlined />}
              type="primary"
              style={{ flex: 1, background: '#52c41a', borderColor: '#52c41a' }}
              onClick={handleKnown}
            >
              {t('ai-chat-flashcard-mark-known', null, 'Known')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
