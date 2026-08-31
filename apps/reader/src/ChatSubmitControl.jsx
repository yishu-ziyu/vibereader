import React from 'react';
import { SendOutlined, StopOutlined } from '@ant-design/icons';
import { Button } from 'antd';

export function ChatSubmitControl({ loading, disabled, onSubmit, onStop }) {
    if (loading) {
        return (
            <Button
                danger
                icon={<StopOutlined />}
                onClick={onStop}
            >
                Stop
            </Button>
        );
    }

    return (
        <Button
            className="btn-black"
            icon={<SendOutlined />}
            disabled={disabled}
            onClick={onSubmit}
        >
            Send
        </Button>
    );
}
