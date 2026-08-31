/**
 * Onboarding overlay — shown only on first launch.
 * Stored dismissal state in localStorage so it never reappears.
 */
import { useState, useCallback } from 'react';
import { Modal, Button, Steps, Typography, Space } from 'antd';
import {
    FileTextOutlined,
    ThunderboltOutlined,
    BookOutlined,
    MessageOutlined,
    CompassOutlined,
} from '@ant-design/icons';
import MarkdownRenderer from '../MarkdownRenderer';
import viberoIconPng from '../../icons/vibero.png';

const { Title, Text } = Typography;

const LS_KEY = 'vibereader.onboarding.dismissed';

const STEPS = [
    {
        icon: <FileTextOutlined style={{ fontSize: 40, color: '#2B7FD8' }} />,
        title: '上传文档',
        desc: '拖拽或点击上传 PDF、Markdown、纯文本文件到左侧面板。支持最近文件快速切换。',
    },
    {
        icon: <ThunderboltOutlined style={{ fontSize: 40, color: '#2B7FD8' }} />,
        title: '开始精读',
        desc: '打开文档后点击顶部「开始精读」，AI 会启动论文总览、阅读路线和带原文依据的卡片生成。',
    },
    {
        icon: <CompassOutlined style={{ fontSize: 40, color: '#2B7FD8' }} />,
        title: '跟随阅读路线',
        desc: '「阅读路线」会标出最值得先看的位置。点击路线项回到原文，逐段确认 AI 的判断。',
    },
    {
        icon: <BookOutlined style={{ fontSize: 40, color: '#2B7FD8' }} />,
        title: '沉淀阅读卡片',
        desc: '把关键段落、AI 回答和路线洞察保存成卡片，每张卡片都能回到原文依据。',
    },
    {
        icon: <MessageOutlined style={{ fontSize: 40, color: '#2B7FD8' }} />,
        title: '继续追问 AI',
        desc: '在「对话」里围绕当前页、当前章节或选中段落提问，让回答始终贴着你的阅读现场。',
    },
];

export function OnboardingOverlay({ onDismiss }) {
    const [current, setCurrent] = useState(0);
    const [dismissed, setDismissed] = useState(
        () => {
            try {
                return Boolean(localStorage.getItem(LS_KEY));
            } catch (_) {
                return false;
            }
        }
    );

    const dismiss = useCallback(() => {
        try {
            localStorage.setItem(LS_KEY, '1');
        } catch (_) { /* ignore */ }
        setDismissed(true);
        onDismiss?.();
    }, [onDismiss]);

    if (dismissed) return null;

    return (
        <Modal
            open
            footer={null}
            closable={false}
            centered
            width={560}
            styles={{ body: { padding: '32px 40px' } }}
        >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <img src={viberoIconPng} width="48" height="48" alt="VibeReader" style={{ marginBottom: 12 }} />
                <Title level={3} style={{ marginBottom: 4 }}>欢迎使用 VibeReader</Title>
                <Text type="secondary">5 步快速上手</Text>
            </div>

            <Steps
                current={current}
                size="small"
                style={{ marginBottom: 28 }}
                items={STEPS.map((s, i) => ({ title: s.title, description: String(i + 1) }))}
            />

            <div style={{ minHeight: 120, textAlign: 'center', marginBottom: 24 }}>
                <div style={{ marginBottom: 12 }}>{STEPS[current].icon}</div>
                <Title level={4} style={{ marginBottom: 8 }}>{STEPS[current].title}</Title>
                <Text type="secondary" style={{ fontSize: 15, lineHeight: 1.6 }}>
                    {STEPS[current].desc}
                </Text>
            </div>

            <div style={{ textAlign: 'right' }}>
                <Space>
                    <Button onClick={dismiss}>跳过</Button>
                    <Button
                        type="primary"
                        onClick={() => current < STEPS.length - 1 ? setCurrent(current + 1) : dismiss()}
                    >
                        {current < STEPS.length - 1 ? '下一步' : '开始使用'}
                    </Button>
                </Space>
            </div>
        </Modal>
    );
}
