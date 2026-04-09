import test from 'node:test';
import assert from 'node:assert/strict';
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

  assert.equal(command, 'gemini --yolo --model gemini-2.5-pro');
});

test('reasoning options are model-specific', () => {
  assert.deepEqual(getReasoningOptions('codex', 'gpt-5.4'), ['low', 'medium', 'high', 'xhigh']);
  assert.deepEqual(getReasoningOptions('cursor', 'auto'), []);
});
