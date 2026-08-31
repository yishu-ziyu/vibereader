import React, { useCallback, useState } from 'react';
import { Button, Input, Tooltip } from 'antd';
import { BookOutlined, HighlightOutlined, MessageOutlined, SaveOutlined } from '@ant-design/icons';
import { t } from './i18n';

export function PdfAnnotationToolbar({ selection, onInject, onHighlight, onSaveNote, onGenerateLensCard }) {
    const [note, setNote] = useState('');
    const [noteOpen, setNoteOpen] = useState(false);

    const handleSaveNote = useCallback(() => {
        if (!noteOpen) {
            setNoteOpen(true);
            return;
        }
        if (!selection?.text || !note.trim()) return;
        onSaveNote?.(selection.text, note.trim());
        setNote('');
        setNoteOpen(false);
    }, [note, noteOpen, onSaveNote, selection?.text]);

    if (!selection) return null;

    return (
        <div
            className="pdf-annotation-toolbar"
            style={{
                position: 'absolute',
                left: selection.x,
                top: selection.y,
            }}
            role="toolbar"
            aria-label="PDF 选区操作"
        >
            <Tooltip title="生成卡片">
                <Button
                    type="primary"
                    size="small"
                    shape="circle"
                    icon={<BookOutlined />}
                    aria-label="生成卡片"
                    onClick={() => onGenerateLensCard?.(selection)}
                />
            </Tooltip>
            <Tooltip title={t('ai-chat-ask-about', null, '询问 AI')}>
                <Button
                    size="small"
                    shape="circle"
                    icon={<MessageOutlined />}
                    aria-label="注入 AI"
                    onClick={() => onInject?.(selection.text)}
                />
            </Tooltip>
            <Tooltip title="高亮">
                <Button
                    size="small"
                    shape="circle"
                    icon={<HighlightOutlined />}
                    aria-label="高亮"
                    onClick={() => onHighlight?.(selection.text)}
                />
            </Tooltip>
            {noteOpen && (
                <Input
                    className="pdf-annotation-note-input"
                    size="small"
                    placeholder="笔记"
                    autoFocus
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    onPressEnter={handleSaveNote}
                />
            )}
            <Tooltip title={noteOpen ? '保存笔记' : '添加笔记'}>
                <Button
                    size="small"
                    shape="circle"
                    icon={<SaveOutlined />}
                    aria-label="保存笔记"
                    onClick={handleSaveNote}
                />
            </Tooltip>
        </div>
    );
}

export default PdfAnnotationToolbar;
