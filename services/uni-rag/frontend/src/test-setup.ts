/// <reference types="vitest" />
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import React from 'react'

vi.mock('framer-motion', () => {
  const MotionDiv = ({ children, ...props }: any) => React.createElement('div', props, children)
  return {
    motion: { div: MotionDiv, span: MotionDiv, button: MotionDiv, h1: MotionDiv, p: MotionDiv, label: MotionDiv },
    AnimatePresence: ({ children }: any) => children,
  }
})
