import { describe, it, expect } from 'vitest'
import { getLevelMeta, listLevels, loadLevel } from '@/utils/levels'

describe('levels', () => {
  it('listLevels 有 10 档且升序', () => {
    const ls = listLevels()
    expect(ls.map(l => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(ls.every(l => l.total > 0)).toBe(true)
  })
  it('getLevelMeta(4) 返回四级元数据', () => {
    const m = getLevelMeta(4)
    expect(m).toBeDefined()
    expect(m!.name.toLowerCase()).toMatch(/cet-4|四级/)
  })
  it('loadLevel 返回正确结构', { timeout: 20000 }, async () => {
    const L4 = await loadLevel(4)
    expect(L4.level).toBe(4)
    expect(Array.isArray(L4.words)).toBe(true)
    expect(L4.words.length).toBeGreaterThan(1000)
    expect(L4.words[0].w && L4.words[0].t.length).toBeTruthy()
  })
  it('loadLevel(99) reject', { timeout: 10000 }, async () => {
    await expect(loadLevel(99)).rejects.toBeInstanceOf(Error)
  })
})
