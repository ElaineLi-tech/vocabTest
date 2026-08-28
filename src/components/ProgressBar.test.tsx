import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProgressBar from '@/components/ProgressBar'

describe('ProgressBar', () => {
  it('渲染进度数值、百分比、填充条宽度正确', () => {
    render(<ProgressBar done={3} total={10} />)
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '30%' })
  })
  it('边界 done=0 => 0%, done>=total => 100%', () => {
    const { rerender } = render(<ProgressBar done={0} total={0} />)
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '0%' })
    rerender(<ProgressBar done={100} total={10} />)
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '100%' })
  })
})
