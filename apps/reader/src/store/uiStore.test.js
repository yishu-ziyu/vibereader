import { describe, expect, it } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore', () => {
  it('starts the right pane on the reading route so deep reading is first-class', () => {
    expect(useUIStore.getInitialState().rightToolTab).toBe('navigator');
  });
});
