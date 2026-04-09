import test from 'node:test';
import assert from 'node:assert/strict';
import { getMostRecentRepoPath } from '../lib/recent-repos';

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
