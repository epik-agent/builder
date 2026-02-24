import { useCallback, useState } from 'react'

const STORAGE_KEY = 'repoHistory'
const MAX_ENTRIES = 10

function initialHistory(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed as string[]
    }
  } catch {
    // ignore malformed data
  }
  return []
}

/** Returns the repo history list and a pushRepo function. Persists to localStorage. */
export function useRepoHistory(): { history: string[]; pushRepo: (repo: string) => void } {
  const [history, setHistory] = useState<string[]>(initialHistory)

  const pushRepo = useCallback((repo: string) => {
    setHistory((current) => {
      const deduped = [repo, ...current.filter((r) => r !== repo)]
      const next = deduped.slice(0, MAX_ENTRIES)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { history, pushRepo }
}
