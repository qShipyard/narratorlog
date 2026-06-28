import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseAuthor, mapCommit } from './index'

describe('parseAuthor', () => {
  test('parses name and email from "Name <email>" format', () => {
    const result = parseAuthor('Jane Doe <jane@example.com>')
    assert.equal(result.name, 'Jane Doe')
    assert.equal(result.email, 'jane@example.com')
  })

  test('handles email-only format', () => {
    const result = parseAuthor('j@x.io <j@x.io>')
    assert.equal(result.name, 'j@x.io')
    assert.equal(result.email, 'j@x.io')
  })

  test('falls back gracefully when no angle brackets', () => {
    const result = parseAuthor('malformed string')
    assert.equal(result.name, 'malformed string')
    assert.equal(result.email, '')
  })

  test('trims whitespace from name and email', () => {
    const result = parseAuthor('  Alice  <  alice@test.com  >')
    assert.equal(result.name, 'Alice')
    assert.equal(result.email, 'alice@test.com')
  })

  test('handles empty string', () => {
    const result = parseAuthor('')
    assert.equal(result.name, '')
    assert.equal(result.email, '')
  })
})

const baseRaw = {
  hash: 'abc123def456',
  message: 'feat: add login flow',
  author: {
    raw: 'Alice <alice@example.com>',
    user: { display_name: 'Alice Display' },
  },
  date: '2024-01-15T10:00:00+00:00',
}

const diffstat = [
  { new: { path: 'src/login.ts' }, old: { path: 'src/login.ts' } },
  { new: { path: 'src/auth.ts' } },
]

const diffstatDeletedFile = [
  { old: { path: 'src/removed.ts' } },
]

const mergedPR = {
  id: 42,
  title: 'Add login flow',
  state: 'MERGED',
  summary: { raw: 'Implements the login flow for the app' },
}

describe('mapCommit', () => {
  test('maps sha, message, author from raw field, committed_at', () => {
    const result = mapCommit(baseRaw, 'messages-only', [], null, null)
    assert.equal(result.sha, 'abc123def456')
    assert.equal(result.message, 'feat: add login flow')
    assert.equal(result.author_name, 'Alice')
    assert.equal(result.author_email, 'alice@example.com')
    assert.equal(result.committed_at, '2024-01-15T10:00:00+00:00')
    assert.deepEqual(result.changed_files, [])
    assert.equal(result.pr_number, undefined)
    assert.equal(result.diff, undefined)
  })

  test('falls back to user.display_name when author.raw has no email', () => {
    const raw = {
      ...baseRaw,
      author: { raw: 'malformed', user: { display_name: 'Fallback Name' } },
    }
    const result = mapCommit(raw, 'messages-only', [], null, null)
    assert.equal(result.author_name, 'malformed')
    assert.equal(result.author_email, '')
  })

  test('falls back to display_name when parsed name is empty', () => {
    const raw = {
      ...baseRaw,
      author: { raw: ' <alice@x.com>', user: { display_name: 'Display Name' } },
    }
    const result = mapCommit(raw, 'messages-only', [], null, null)
    assert.equal(result.author_name, 'Display Name')
    assert.equal(result.author_email, 'alice@x.com')
  })

  test('maps PR fields when present', () => {
    const result = mapCommit(baseRaw, 'messages-only', [], null, mergedPR)
    assert.equal(result.pr_number, 42)
    assert.equal(result.pr_title, 'Add login flow')
    assert.equal(result.pr_description, 'Implements the login flow for the app')
  })

  test('omits pr_description when summary.raw absent', () => {
    const pr = { id: 10, title: 'No summary', state: 'MERGED' }
    const result = mapCommit(baseRaw, 'messages-only', [], null, pr)
    assert.equal(result.pr_number, 10)
    assert.equal(result.pr_description, undefined)
  })

  test('messages-only depth: no changed_files or diff even with data', () => {
    const result = mapCommit(baseRaw, 'messages-only', diffstat, 'raw diff text', null)
    assert.deepEqual(result.changed_files, [])
    assert.equal(result.diff, undefined)
  })

  test('standard depth: populates changed_files, no diff', () => {
    const result = mapCommit(baseRaw, 'standard', diffstat, 'raw diff text', null)
    assert.deepEqual(result.changed_files, ['src/login.ts', 'src/auth.ts'])
    assert.equal(result.diff, undefined)
  })

  test('deep depth: populates changed_files and diff', () => {
    const result = mapCommit(baseRaw, 'deep', diffstat, 'raw diff text', null)
    assert.deepEqual(result.changed_files, ['src/login.ts', 'src/auth.ts'])
    assert.equal(result.diff, 'raw diff text')
  })

  test('deep depth with null diff: no diff field', () => {
    const result = mapCommit(baseRaw, 'deep', diffstat, null, null)
    assert.deepEqual(result.changed_files, ['src/login.ts', 'src/auth.ts'])
    assert.equal(result.diff, undefined)
  })

  test('uses old.path when new.path absent (deleted file)', () => {
    const result = mapCommit(baseRaw, 'standard', diffstatDeletedFile, null, null)
    assert.deepEqual(result.changed_files, ['src/removed.ts'])
  })

  test('two commits mapped independently', () => {
    const raw2 = { ...baseRaw, hash: 'fff999', message: 'fix: null pointer' }
    const r1 = mapCommit(baseRaw, 'messages-only', [], null, null)
    const r2 = mapCommit(raw2, 'messages-only', [], null, null)
    assert.equal(r1.sha, 'abc123def456')
    assert.equal(r2.sha, 'fff999')
    assert.equal(r2.message, 'fix: null pointer')
  })
})
