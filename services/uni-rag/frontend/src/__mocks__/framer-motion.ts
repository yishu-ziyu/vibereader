/// <reference types="vitest" />
import { vi } from 'vitest'

vi.mock('framer-motion', () => {
  return {
    motion: new Proxy({}, {
      get: (_target, prop) => {
        if (['div', 'span', 'button', 'h1', 'p', 'label'].includes(String(prop))) {
          return ({ children, ...props }: any) => (props as any).children
        }
        if (prop === 'AnimatePresence') {
          return ({ children }: any) => children
        }
        return () => null
      }
    }),
    AnimatePresence: ({ children }: any) => children,
  }
})
