import { execSync } from 'child_process'
import type { IssueGraph, IssueNode } from '../client/types.ts'

/**
 * Parses "Blocked by" links from an issue body.
 * Looks for lines like "- #N" under a "Blocked by" heading.
 */
function parseBlockedBy(body: string): number[] {
  const blockedBy: number[] = []
  const lines = body.split('\n')
  let inBlockedBy = false

  for (const line of lines) {
    if (/blocked\s+by/i.test(line)) {
      inBlockedBy = true
      continue
    }
    if (inBlockedBy) {
      const match = line.match(/^[-*]\s+#(\d+)/)
      if (match) {
        blockedBy.push(parseInt(match[1], 10))
      } else if (line.trim() === '') {
        continue
      } else if (/^#/.test(line.trim()) || /^##/.test(line.trim())) {
        break
      }
    }
  }

  return blockedBy
}

/**
 * Determines the issue type from label names.
 */
function parseType(labels: string[]): IssueNode['type'] {
  if (labels.includes('Feature')) return 'Feature'
  if (labels.includes('Task')) return 'Task'
  if (labels.includes('Bug')) return 'Bug'
  return null
}

/**
 * Loads the issue dependency graph for the given GitHub repository using the `gh` CLI.
 */
export async function loadIssueGraph(repo: string): Promise<IssueGraph> {
  const json = execSync(
    `gh issue list --repo ${repo} --state all --limit 100 --json number,title,state,labels,body`,
    { encoding: 'utf8' },
  )

  const issues = JSON.parse(json) as Array<{
    number: number
    title: string
    state: string
    labels: Array<{ name: string }>
    body: string
  }>

  const nodes: IssueNode[] = issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state === 'OPEN' || issue.state === 'open' ? 'open' : 'closed',
    type: parseType(issue.labels.map((l) => l.name)),
    external: false,
    blockedBy: parseBlockedBy(issue.body ?? ''),
  }))

  return { nodes }
}
