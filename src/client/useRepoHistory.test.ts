import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { useRepoHistory } from './useRepoHistory'

beforeEach(() => {
  localStorage.clear()
})

describe('useRepoHistory', () => {
  it('returns empty array when localStorage has no history', () => {
    const { result } = renderHook(() => useRepoHistory())
    expect(result.current.history).toEqual([])
  })

  it('reads existing history from localStorage on init', () => {
    localStorage.setItem('repoHistory', JSON.stringify(['owner/repo', 'facebook/react']))
    const { result } = renderHook(() => useRepoHistory())
    expect(result.current.history).toEqual(['owner/repo', 'facebook/react'])
  })

  it('pushRepo adds a new entry to the front', () => {
    const { result } = renderHook(() => useRepoHistory())
    act(() => {
      result.current.pushRepo('owner/repo')
    })
    expect(result.current.history[0]).toBe('owner/repo')
    expect(result.current.history).toHaveLength(1)
  })

  it('pushRepo moves an existing entry to the front without duplicating it', () => {
    localStorage.setItem('repoHistory', JSON.stringify(['facebook/react', 'owner/repo']))
    const { result } = renderHook(() => useRepoHistory())
    act(() => {
      result.current.pushRepo('owner/repo')
    })
    expect(result.current.history).toEqual(['owner/repo', 'facebook/react'])
  })

  it('pushRepo caps the list at 10 entries', () => {
    const initial = Array.from({ length: 10 }, (_, i) => `user/repo${i}`)
    localStorage.setItem('repoHistory', JSON.stringify(initial))
    const { result } = renderHook(() => useRepoHistory())
    act(() => {
      result.current.pushRepo('new/repo')
    })
    expect(result.current.history).toHaveLength(10)
    expect(result.current.history[0]).toBe('new/repo')
    expect(result.current.history).not.toContain('user/repo9')
  })

  it('pushRepo persists updated history to localStorage', () => {
    const { result } = renderHook(() => useRepoHistory())
    act(() => {
      result.current.pushRepo('owner/repo')
    })
    expect(JSON.parse(localStorage.getItem('repoHistory') ?? '[]')).toEqual(['owner/repo'])
  })
})
