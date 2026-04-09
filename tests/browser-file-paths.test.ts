import test from 'node:test';
import assert from 'node:assert/strict';
import { getAbsolutePathsFromFiles, getDirectoryPathFromFiles } from '../lib/browser-file-paths';

test('getAbsolutePathsFromFiles extracts non-empty absolute paths', () => {
  const paths = getAbsolutePathsFromFiles([
    { path: '/tmp/alpha.txt' } as File,
    { path: " /tmp/O'Reilly.txt " } as File,
    {} as File,
  ]);

  assert.deepEqual(paths, ['/tmp/alpha.txt', "/tmp/O'Reilly.txt"]);
});

test('getDirectoryPathFromFiles derives the root directory from webkitRelativePath', () => {
  const directoryPath = getDirectoryPathFromFiles([
    {
      path: '/Users/demo/project/src/index.ts',
      webkitRelativePath: 'src/index.ts',
    } as File,
  ]);

  assert.equal(directoryPath, '/Users/demo/project');
});
