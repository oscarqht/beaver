import test from 'node:test';
import assert from 'node:assert/strict';
import { getMostRecentRepoPath, getPreferredRepoPath } from '../lib/recent-repos';

test('getMostRecentRepoPath returns the first non-empty recent repo path', () => {
  assert.equal(
    getMostRecentRepoPath(['   ', '/tmp/first-repo  ', '/tmp/second-repo']),
    '/tmp/first-repo',
  );
});

test('getMostRecentRepoPath returns an empty string when there is no valid repo path', () => {
  assert.equal(getMostRecentRepoPath(['', '   ']), '');
  assert.equal(getMostRecentRepoPath([]), '');
});

test('getPreferredRepoPath returns the last selected repo path when it is available', () => {
  assert.equal(
    getPreferredRepoPath(['/tmp/first-repo', '/tmp/second-repo'], '  /tmp/second-repo  '),
    '/tmp/second-repo',
  );
});

test('getPreferredRepoPath falls back to the most recent repo path when no last selection is stored', () => {
  assert.equal(getPreferredRepoPath(['/tmp/first-repo', '/tmp/second-repo'], '   '), '/tmp/first-repo');
  assert.equal(getPreferredRepoPath(['/tmp/first-repo', '/tmp/second-repo']), '/tmp/first-repo');
});
