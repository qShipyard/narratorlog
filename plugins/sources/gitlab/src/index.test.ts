import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mapCommit } from './index'
import type { CommitSchema, CommitDiffSchema, MergeRequestSchema } from '@gitbeaker/rest'

const baseCommit: CommitSchema = {
  id: 'abc123',
  short_id: 'abc123',
  message: 'feat: add login flow',
  title: 'feat: add login flow',
  author_name: 'Alice',
  author_email: 'alice@example.com',
  created_at: '2024-01-01T10:00:00Z',
  committed_date: '2024-01-01T10:00:00Z',
  web_url: 'https://gitlab.com/org/project/-/commit/abc123',
}

const diffFiles: CommitDiffSchema[] = [
  {
    diff: '@@ -1 +1 @@ console.log("hello")',
    new_path: 'src/login.ts',
    old_path: 'src/login.ts',
    b_mode: '100644',
    new_file: false,
    renamed_file: false,
    deleted_file: false,
  },
  {
    diff: '@@ -0,0 +1 @@ export {}',
    new_path: 'src/auth.ts',
    old_path: '',
    b_mode: '100644',
    new_file: true,
    renamed_file: false,
    deleted_file: false,
  },
]

const mergedMR = {
  id: 1001,
  iid: 42,
  project_id: 5,
  title: 'Add login flow',
  description: 'Implements the login flow for the app',
  state: 'merged',
  merged_at: '2024-01-01T10:00:00Z',
} as MergeRequestSchema

describe('mapCommit', () => {
  test('maps sha, message, author, committed_at', () => {
    const result = mapCommit(baseCommit, 'messages-only', [], null)
    assert.equal(result.sha, 'abc123')
    assert.equal(result.message, 'feat: add login flow')
    assert.equal(result.author_name, 'Alice')
    assert.equal(result.author_email, 'alice@example.com')
    assert.equal(result.committed_at, '2024-01-01T10:00:00Z')
    assert.deepEqual(result.changed_files, [])
    assert.equal(result.pr_number, undefined)
  })

  test('falls back to created_at when committed_date is absent', () => {
    const c = { ...baseCommit, committed_date: undefined }
    const result = mapCommit(c, 'messages-only', [], null)
    assert.equal(result.committed_at, '2024-01-01T10:00:00Z')
  })

  test('maps MR fields when present', () => {
    const result = mapCommit(baseCommit, 'messages-only', [], mergedMR)
    assert.equal(result.pr_number, 42)
    assert.equal(result.pr_title, 'Add login flow')
    assert.equal(result.pr_description, 'Implements the login flow for the app')
  })

  test('standard depth: populates changed_files, no diff', () => {
    const result = mapCommit(baseCommit, 'standard', diffFiles, null)
    assert.deepEqual(result.changed_files, ['src/login.ts', 'src/auth.ts'])
    assert.equal(result.diff, undefined)
  })

  test('deep depth: populates changed_files and diff', () => {
    const result = mapCommit(baseCommit, 'deep', diffFiles, null)
    assert.deepEqual(result.changed_files, ['src/login.ts', 'src/auth.ts'])
    assert.ok(result.diff?.includes('@@ -1 +1 @@'))
    assert.ok(result.diff?.includes('@@ -0,0 +1 @@'))
  })

  test('messages-only depth: no changed_files or diff', () => {
    const result = mapCommit(baseCommit, 'messages-only', diffFiles, null)
    assert.deepEqual(result.changed_files, [])
    assert.equal(result.diff, undefined)
  })

  test('two commits mapped independently', () => {
    const commit2: CommitSchema = {
      ...baseCommit,
      id: 'def456',
      message: 'fix: resolve null pointer',
    }
    const r1 = mapCommit(baseCommit, 'messages-only', [], null)
    const r2 = mapCommit(commit2, 'messages-only', [], null)
    assert.equal(r1.sha, 'abc123')
    assert.equal(r2.sha, 'def456')
    assert.equal(r2.message, 'fix: resolve null pointer')
  })
})
