import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button, Tooltip, Space } from 'antd';
import { CopyOutlined, CheckOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import ChatImageLightbox from './ChatImageLightbox';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'highlight.js/styles/github.css'; // 代码高亮样式
import 'katex/dist/katex.min.css'; // 数学公式样式

/**
 * 代码块工具栏：复制、折叠、语言显示
 */
function CodeBlockToolbar({ lang, codeText, onExplain }) {
    const [copied, setCopied] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(codeText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error('Copy failed:', e);
        }
    }, [codeText]);

    return (
        <div className="code-block-toolbar">
            <Space size={4}>
                {lang && <span className="code-block-lang-tag">{lang}</span>}
                {onExplain && (
                    <Tooltip title="Explain this code">
                        <Button
                            type="text"
                            size="small"
                            className="code-block-btn"
                            onClick={onExplain}
                        >
                            Explain
                        </Button>
                    </Tooltip>
                )}
                <Tooltip title={collapsed ? 'Expand' : 'Collapse'}>
                    <Button
                        type="text"
                        size="small"
                        icon={collapsed ? <RightOutlined /> : <DownOutlined />}
                        className="code-block-btn"
                        onClick={() => setCollapsed(!collapsed)}
                    />
                </Tooltip>
                <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                    <Button
                        type="text"
                        size="small"
                        icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                        className="code-block-btn"
                        onClick={handleCopy}
                    />
                </Tooltip>
            </Space>
            {collapsed && <div className="code-block-collapsed-hint">{codeText.slice(0, 60)}...</div>}
        </div>
    );
}

/**
 * 增强型代码块组件：带工具栏、可复制、可折叠
 */
function EnhancedCodeBlock({ className, children, onExplainCode }) {
    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? match[1] : '';
    const codeText = React.Children.toArray(children)
        .map((c) => (typeof c === 'string' ? c : ''))
        .join('');
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className={`code-block-wrapper ${collapsed ? 'collapsed' : ''}`}>
            <CodeBlockToolbar
                lang={lang}
                codeText={codeText}
                onExplain={onExplainCode ? () => onExplainCode(codeText, lang) : null}
            />
            {!collapsed && (
                <code className={className}>{children}</code>
            )}
        </div>
    );
}

/**
 * Markdown 渲染组件
 * 用于将 AI 返回的 Markdown 文本转换为格式化的 HTML
 * 支持：
 * - GitHub Flavored Markdown (表格、删除线等)
 * - LaTeX 数学公式 (行内: $...$ 或 \(...\), 块级: $$...$$ 或 \[...\])
 * - 代码高亮 + 代码协同阅读（复制、折叠、Explain）
 */
const MarkdownRenderer = ({ content, onExplainCode }) => {
    return (
        <div className="markdown-content">
            <ReactMarkdown
                remarkPlugins={[
                    remarkGfm,  // GitHub Flavored Markdown
                    remarkMath  // 数学公式支持
                ]}
                rehypePlugins={[
                    // strict: 'ignore' 减少因 Unicode/部分 LaTeX 变体导致的硬失败；语法错误仍会走 rehype-katex 的降级分支
                    [rehypeKatex, { strict: 'ignore' }],
                    rehypeHighlight, // 代码高亮
                    rehypeRaw        // 支持 HTML
                ]}
                components={{
                    // 自定义代码块样式
                    code({ node, inline, className, children, ...props }) {
                        if (inline) {
                            return (
                                <code className="inline-code" {...props}>
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <EnhancedCodeBlock className={className} onExplainCode={onExplainCode}>
                                {children}
                            </EnhancedCodeBlock>
                        );
                    },
                    // 自定义 pre 标签：代码块容器
                    pre({ node, children, ...props }) {
                        // pre 由 EnhancedCodeBlock 内部处理，这里只返回 children
                        return <>{children}</>;
                    },
                    // 自定义链接样式（在新标签页打开）
                    a({ node, children, href, ...props }) {
                        return (
                            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                                {children}
                            </a>
                        );
                    },
                    // 自定义表格样式
                    table({ node, children, ...props }) {
                        return (
                            <div className="table-wrapper">
                                <table {...props}>{children}</table>
                            </div>
                        );
                    },
                    // Markdown 内图片：与输入区一致的可点击大图预览
                    img({ node, src, alt, ...props }) {
                        if (!src) return null;
                        return (
                            <ChatImageLightbox
                                src={src}
                                alt={typeof alt === 'string' ? alt : ''}
                                imgProps={props}
                            />
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownRenderer;

