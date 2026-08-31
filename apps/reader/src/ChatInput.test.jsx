import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatSubmitControl } from './ChatSubmitControl';

describe('ChatInput stop control', () => {
    afterEach(() => {
        cleanup();
    });

    it('shows a Stop control during generation and calls onStop when clicked', () => {
        const onStop = vi.fn();

        render(<ChatSubmitControl loading disabled={false} onSubmit={vi.fn()} onStop={onStop} />);

        fireEvent.click(screen.getByRole('button', { name: /stop/i }));

        expect(onStop).toHaveBeenCalledTimes(1);
    });
});
