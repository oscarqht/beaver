import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getProviderConfig, getReasoningOptions } from '../lib/provider-config';

test('codex command includes model and reasoning flags', () => {
  const command = getProviderConfig('codex').buildCommand({
    model: 'gpt-5.4',
    reasoningEffort: 'high',
  });

  assert.match(command, /\bcodex\b/);
  assert.match(command, /approval_policy="never"/);
  assert.match(command, /sandbox_mode="danger-full-access"/);
  assert.match(command, /model="gpt-5\.4"/);
  assert.match(command, /model_reasoning_effort="high"/);
});

test('gemini command ignores reasoning and uses yolo mode', () => {
  const command = getProviderConfig('gemini').buildCommand({
    model: 'gemini-2.5-pro',
    reasoningEffort: 'high',
  });

  assert.match(command, /^".*gemini"? --yolo --model gemini-2\.5-pro$/);
});

test('reasoning options are model-specific', () => {
  assert.deepEqual(getReasoningOptions('codex', 'gpt-5.4'), ['low', 'medium', 'high', 'xhigh']);
  assert.deepEqual(getReasoningOptions('cursor', 'auto'), []);
});

test('codex command resolves the executable to an absolute path from PATH', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'beaver-provider-'));
  const fakeCodexPath = path.join(tempDir, 'codex');
  await fs.writeFile(fakeCodexPath, '#!/bin/sh\nexit 0\n', 'utf8');
  await fs.chmod(fakeCodexPath, 0o755);

  const originalPath = process.env.PATH;
  delete process.env.BEVER_CODEX_BIN;
  process.env.PATH = `${tempDir}:${originalPath ?? ''}`;

  try {
    const command = getProviderConfig('codex').buildCommand({
      model: 'gpt-5.4',
      reasoningEffort: 'high',
    });

    assert.match(command, new RegExp(`^\"${fakeCodexPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\"`));
  } finally {
    process.env.PATH = originalPath;
  }
});
