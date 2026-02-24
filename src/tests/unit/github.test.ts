import { describe, it, expect, vi } from 'vitest'
import { loadIssueGraph, getPRStatus, runGhCommand } from '../../server/github.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal GraphQL response shape for loadIssueGraph */
function makeGqlResponse(
  issues: Array<{
    number: number
    title: string
    state: string
    labels: Array<{ name: string }>
    blockedBy: Array<{ number: number }>
  }>,
  projectsV2TotalCount = 1,
) {
  return {
    data: {
      repository: {
        issues: {
          nodes: issues.map((i) => ({
            number: i.number,
            title: i.title,
            state: i.state,
            labels: { nodes: i.labels },
            blockedBy: { nodes: i.blockedBy },
          })),
        },
        projectsV2: { totalCount: projectsV2TotalCount },
      },
    },
  }
}

const GQL_ISSUE_FIXTURE = makeGqlResponse([
  { number: 1, title: 'Root feature', state: 'open', labels: [{ name: 'Feature' }], blockedBy: [] },
  {
    number: 2,
    title: 'Blocked task',
    state: 'open',
    labels: [{ name: 'Task' }],
    blockedBy: [{ number: 1 }],
  },
  {
    number: 3,
    title: 'Multi-blocked task',
    state: 'open',
    labels: [{ name: 'Bug' }],
    blockedBy: [{ number: 1 }, { number: 2 }],
  },
  { number: 4, title: 'No type label', state: 'open', labels: [], blockedBy: [] },
  {
    number: 5,
    title: 'Unlabelled with body',
    state: 'open',
    labels: [{ name: 'enhancement' }],
    blockedBy: [],
  },
])

/** PR list fixture for getPRStatus */
const PR_FIXTURE_OPEN = [
  {
    number: 101,
    title: 'Fix issue 2',
    state: 'open',
    headRefName: 'feature/blocked-task-2',
    body: 'Closes #2',
    mergeable: 'MERGEABLE',
    statusCheckRollup: { state: 'SUCCESS' },
  },
]

const PR_FIXTURE_FAILING = [
  {
    number: 102,
    title: 'Fix issue 3',
    state: 'open',
    headRefName: 'feature/multi-blocked-3',
    body: 'Closes #3',
    mergeable: 'CONFLICTING',
    statusCheckRollup: { state: 'FAILURE' },
  },
]

const PR_FIXTURE_PENDING = [
  {
    number: 103,
    title: 'Fix issue 1',
    state: 'open',
    headRefName: 'feature/root-feature-1',
    body: 'Closes #1',
    mergeable: 'MERGEABLE',
    statusCheckRollup: null,
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock exec function that resolves with the serialized fixture. */
function makeExec(fixture: object): (args: string[]) => Promise<string> {
  return vi.fn().mockResolvedValue(JSON.stringify(fixture))
}

/** Build a mock exec function for PR list (array response). */
function makeExecArray(fixture: object[]): (args: string[]) => Promise<string> {
  return vi.fn().mockResolvedValue(JSON.stringify(fixture))
}

/** Build a mock exec function that rejects with the given error. */
function makeExecError(err: Error): (args: string[]) => Promise<string> {
  return vi.fn().mockRejectedValue(err)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('github', () => {
  // -------------------------------------------------------------------------
  // loadIssueGraph
  // -------------------------------------------------------------------------

  describe('loadIssueGraph', () => {
    it('returns an IssueGraph with nodes for each open issue', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(GQL_ISSUE_FIXTURE))
      expect(graph.nodes).toHaveLength(5)
    })

    it('sets the correct issue number, title and state on each node', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(GQL_ISSUE_FIXTURE))
      const node1 = graph.nodes.find((n) => n.number === 1)
      expect(node1?.title).toBe('Root feature')
      expect(node1?.state).toBe('open')
    })

    it('maps Feature label to type "Feature"', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(GQL_ISSUE_FIXTURE))
      expect(graph.nodes.find((n) => n.number === 1)?.type).toBe('Feature')
    })

    it('maps Task label to type "Task"', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(GQL_ISSUE_FIXTURE))
      expect(graph.nodes.find((n) => n.number === 2)?.type).toBe('Task')
    })

    it('maps Bug label to type "Bug"', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(GQL_ISSUE_FIXTURE))
      expect(graph.nodes.find((n) => n.number === 3)?.type).toBe('Bug')
    })

    it('sets type to null when no recognized label is present', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(GQL_ISSUE_FIXTURE))
      expect(graph.nodes.find((n) => n.number === 4)?.type).toBeNull()
      expect(graph.nodes.find((n) => n.number === 5)?.type).toBeNull()
    })

    it('sets external to false for all nodes by default', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(GQL_ISSUE_FIXTURE))
      for (const node of graph.nodes) {
        expect(node.external).toBe(false)
      }
    })

    it('derives directed edges from blockedBy nodes', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(GQL_ISSUE_FIXTURE))
      // node 2 blockedBy [1] → edge { source: 1, target: 2 }
      // node 3 blockedBy [1, 2] → edges { source: 1, target: 3 }, { source: 2, target: 3 }
      expect(graph.edges).toContainEqual({ source: 1, target: 2 })
      expect(graph.edges).toContainEqual({ source: 1, target: 3 })
      expect(graph.edges).toContainEqual({ source: 2, target: 3 })
    })

    it('calls gh api graphql with owner and repo variables', async () => {
      const exec = vi
        .fn<(args: string[]) => Promise<string>>()
        .mockResolvedValue(JSON.stringify(makeGqlResponse([])))
      await loadIssueGraph('myorg', 'myrepo', exec)
      const [args] = exec.mock.calls[0]
      expect(args).toContain('graphql')
      expect(args.join(' ')).toContain('owner=myorg')
      expect(args.join(' ')).toContain('repo=myrepo')
    })

    it('handles an empty issues list', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(makeGqlResponse([])))
      expect(graph.nodes).toHaveLength(0)
      expect(graph.edges).toEqual([])
    })

    it('returns empty edges for a graph with no dependencies', async () => {
      const noDepFixture = makeGqlResponse([
        { number: 1, title: 'A', state: 'open', labels: [], blockedBy: [] },
      ])
      const graph = await loadIssueGraph('owner', 'repo', makeExec(noDepFixture))
      expect(graph.edges).toEqual([])
    })

    it('sets warning when projectsV2 totalCount is 0', async () => {
      const fixture = makeGqlResponse([], 0)
      const graph = await loadIssueGraph('owner', 'repo', makeExec(fixture))
      expect(graph.warning).toBeTruthy()
    })

    it('does not set warning when projectsV2 totalCount is greater than 0', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(GQL_ISSUE_FIXTURE))
      expect(graph.warning).toBeUndefined()
    })

    it('rejects on gh cli error', async () => {
      const exec = makeExecError(new Error('gh: not found'))
      let caught: Error | null = null
      try {
        await loadIssueGraph('owner', 'repo', exec)
      } catch (err) {
        caught = err as Error
      }
      expect(caught?.message).toContain('gh: not found')
    })
  })

  // -------------------------------------------------------------------------
  // getPRStatus
  // -------------------------------------------------------------------------

  describe('getPRStatus', () => {
    it('returns null when no PR is associated with the issue', async () => {
      const result = await getPRStatus('owner', 'repo', 99, makeExecArray([]))
      expect(result).toBeNull()
    })

    it('returns checksState "success" when CI is green and branch is mergeable', async () => {
      const result = await getPRStatus('owner', 'repo', 2, makeExecArray(PR_FIXTURE_OPEN))
      expect(result).not.toBeNull()
      expect(result?.checksState).toBe('success')
      expect(result?.mergeable).toBe(true)
    })

    it('returns checksState "failure" and mergeable false when CI fails and branch conflicts', async () => {
      const result = await getPRStatus('owner', 'repo', 3, makeExecArray(PR_FIXTURE_FAILING))
      expect(result?.checksState).toBe('failure')
      expect(result?.mergeable).toBe(false)
    })

    it('returns checksState "pending" when statusCheckRollup is null', async () => {
      const result = await getPRStatus('owner', 'repo', 1, makeExecArray(PR_FIXTURE_PENDING))
      expect(result?.checksState).toBe('pending')
    })

    it('returns checksState "failure" when statusCheckRollup state is ERROR', async () => {
      const errorFixture = [
        {
          number: 104,
          body: 'Closes #5',
          mergeable: 'MERGEABLE',
          statusCheckRollup: { state: 'ERROR' },
        },
      ]
      const result = await getPRStatus('owner', 'repo', 5, makeExecArray(errorFixture))
      expect(result?.checksState).toBe('failure')
    })

    it('returns checksState "pending" when statusCheckRollup state is unknown value', async () => {
      const unknownFixture = [
        {
          number: 105,
          body: 'Closes #6',
          mergeable: 'MERGEABLE',
          statusCheckRollup: { state: 'IN_PROGRESS' },
        },
      ]
      const result = await getPRStatus('owner', 'repo', 6, makeExecArray(unknownFixture))
      expect(result?.checksState).toBe('pending')
    })

    it('includes prNumber in the result', async () => {
      const result = await getPRStatus('owner', 'repo', 2, makeExecArray(PR_FIXTURE_OPEN))
      expect(result?.prNumber).toBe(101)
    })

    it('returns null when no PR body matches the issue number', async () => {
      const fixture = [{ number: 200, body: null, mergeable: null, statusCheckRollup: null }]
      const result = await getPRStatus('owner', 'repo', 42, makeExecArray(fixture))
      expect(result).toBeNull()
    })

    it('returns checksState "pending" when statusCheckRollup has no state property', async () => {
      // statusCheckRollup is non-null but has no .state — the ?. chain returns undefined → pending
      const fixture = [
        {
          number: 106,
          body: 'Closes #7',
          mergeable: 'MERGEABLE',
          statusCheckRollup: {},
        },
      ]
      const result = await getPRStatus('owner', 'repo', 7, makeExecArray(fixture))
      expect(result?.checksState).toBe('pending')
    })
  })

  // -------------------------------------------------------------------------
  // runGhCommand
  // -------------------------------------------------------------------------

  describe('runGhCommand', () => {
    it('rejects when gh is not found on PATH', async () => {
      // Point PATH away from gh so execFile fails
      const savedPath = process.env['PATH']
      process.env['PATH'] = '/nonexistent'
      let threw = false
      try {
        await runGhCommand(['version'])
      } catch {
        threw = true
      } finally {
        process.env['PATH'] = savedPath
      }
      expect(threw).toBe(true)
    })

    it('resolves with stdout when the command succeeds', async () => {
      // Use node (always on PATH) as the binary to exercise the success path
      // without requiring gh to be installed.
      const output = await runGhCommand(['--version'], 'node')
      expect(output.trim()).toMatch(/^v\d+/)
    })
  })
})
