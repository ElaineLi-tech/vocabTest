import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from '@/pages/Home'

describe('Home (TR-4.1 基础)', () => {
  it('renders title, 2 mode tabs (默认快速选中), 开始按钮', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText(/你的英语词汇量有多少？/)).toBeInTheDocument()
    const fastTab = screen.getByRole('tab', { name: /快速模式/ })
    const preciseTab = screen.getByRole('tab', { name: /精准模式/ })
    expect(fastTab).toHaveAttribute('aria-selected', 'true')
    expect(preciseTab).toHaveAttribute('aria-selected', 'false')
    const btn = screen.getByTestId('start-btn')
    expect(btn.getAttribute('href')).toBe('/quiz?mode=fast')
  })
})
