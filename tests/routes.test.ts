import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest } from 'next/server';
import { GET as getBranches } from '../app/api/git/branches/route';
import { POST as createTask } from '../app/api/tasks/route';
import { GET as getTask } from '../app/api/tasks/[id]/route';

const execFileAsync = promisify(execFile);

async function createRepo() {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-route-'));
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.name', 'Bever Test'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.email', 'bever@example.com'], { cwd: repoPath });
  await fs.writeFile(path.join(repoPath, 'index.ts'), 'export {};\n', 'utf8');
  await execFileAsync('git', ['add', 'index.ts'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repoPath });
  return repoPath;
}

test('branch route returns validation errors for invalid paths', async () => {
  const response = await getBranches(new NextRequest('http://localhost/api/git/branches?path=/missing'));
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.match(payload.error, /does not exist|not a Git repository/i);
});

test('task routes create and expose pending task metadata', async () => {
  const repoPath = await createRepo();
  process.env.BEVER_HOME_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-routes-home-'));

  const createResponse = await createTask(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: repoPath,
        mode: 'local',
        provider: 'codex',
        model: 'gpt-5.4',
        reasoningEffort: 'low',
        selectedBranch: 'main',
      }),
    }),
  );
  const createPayload = await createResponse.json();
  assert.equal(createResponse.status, 200);
  assert.ok(createPayload.taskId);

  const detailsResponse = await getTask(new Request('http://localhost/api/tasks/id'), {
    params: Promise.resolve({ id: createPayload.taskId }),
  });
  const detailsPayload = await detailsResponse.json();
  assert.equal(detailsResponse.status, 200);
  assert.equal(detailsPayload.task.status, 'pending');
  assert.equal(detailsPayload.task.selectedBranch, 'main');
});
