import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme, ThemeBootstrap } from '@/hooks/useTheme'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('useTheme (TR-5.4)', () => {
  it('默认 light，切换后 dark，再切换回到 light', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current[0]).toBe('light')
    act(() => { result.current[2]() }) // toggle
    expect(result.current[0]).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    act(() => { result.current[2]() })
    expect(result.current[0]).toBe('light')
  })
  it('ThemeBootstrap 读取 localStorage 初始化 dark', () => {
    localStorage.setItem('vocab-theme', 'dark')
    ThemeBootstrap.apply()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
