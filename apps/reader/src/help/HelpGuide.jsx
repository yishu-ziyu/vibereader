/**
 * HelpGuide — full feature guide, opened from sidebar help button.
 */
import { Modal, Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import MarkdownRenderer from '../MarkdownRenderer';
import { HELP_GUIDE_MARKDOWN } from './helpGuideContent';

export function HelpGuide({ open, onClose }) {
    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            closable
            centered
            width={720}
            styles={{ body: { padding: 0, maxHeight: '75vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
            title={<span style={{ fontWeight: 600 }}>使用指南</span>}
            closeIcon={<CloseOutlined />}
        >
            <div style={{ padding: '24px 32px', overflowY: 'auto', flex: 1 }}>
                <MarkdownRenderer content={HELP_GUIDE_MARKDOWN} />
            </div>
            <div style={{ padding: '12px 32px', borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                <Button onClick={onClose}>关闭</Button>
            </div>
        </Modal>
    );
}
