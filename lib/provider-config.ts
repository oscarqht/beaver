import type { ProviderConfig, ProviderId, ReasoningEffort } from './types';

const GPT5_REASONING: ReasoningEffort[] = ['low', 'medium', 'high'];
const CODEX_REASONING: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];

function quoteShellValue(value: string): string {
  return JSON.stringify(value);
}

export const providerCatalog: ProviderConfig[] = [
  {
    id: 'codex',
    label: 'Codex CLI',
    models: [
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        description: 'Balanced frontier GPT-5 model.',
        reasoningEfforts: CODEX_REASONING,
      },
      {
        id: 'gpt-5.3-codex',
        label: 'GPT-5.3 Codex',
        description: 'Agentic coding model tuned for code tasks.',
        reasoningEfforts: CODEX_REASONING,
      },
      {
        id: 'gpt-5',
        label: 'GPT-5',
        description: 'General GPT-5 model.',
        reasoningEfforts: GPT5_REASONING,
      },
      {
        id: 'o3',
        label: 'o3',
        description: 'Reasoning-focused model.',
        reasoningEfforts: GPT5_REASONING,
      },
    ],
    buildCommand({ model, reasoningEffort }) {
      const binary = process.env.BEVER_CODEX_BIN?.trim() || 'codex';
      const args = [
        '-c',
        'approval_policy="never"',
        '-c',
        'sandbox_mode="danger-full-access"',
      ];
      if (model.trim()) {
        args.push('-c', `model=${quoteShellValue(model.trim())}`);
      }
      if (reasoningEffort?.trim()) {
        args.push('-c', `model_reasoning_effort=${quoteShellValue(reasoningEffort.trim())}`);
      }
      return [binary, ...args].join(' ');
    },
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    models: [
      {
        id: 'auto-gemini-2.5',
        label: 'Auto Gemini 2.5',
        description: 'Route between Gemini 2.5 variants.',
      },
      {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro',
        description: 'Highest-quality Gemini 2.5 coding model.',
      },
      {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        description: 'Faster Gemini 2.5 model.',
      },
      {
        id: 'gemini-3-pro-preview',
        label: 'Gemini 3 Pro Preview',
        description: 'Preview Gemini 3 Pro model.',
      },
    ],
    buildCommand({ model }) {
      const binary = process.env.BEVER_GEMINI_BIN?.trim() || 'gemini';
      const args = ['--yolo'];
      if (model.trim()) {
        args.push('--model', model.trim());
      }
      return [binary, ...args].join(' ');
    },
  },
  {
    id: 'cursor',
    label: 'Cursor Agent CLI',
    models: [
      {
        id: 'auto',
        label: 'Auto',
        description: 'Let Cursor choose the best model.',
      },
      {
        id: 'gpt-5.3-codex',
        label: 'GPT-5.3 Codex',
        description: 'OpenAI coding-focused model in Cursor.',
      },
      {
        id: 'opus-4.6-thinking',
        label: 'Claude 4.6 Opus (Thinking)',
        description: 'High-capability Claude model in Cursor.',
      },
      {
        id: 'gemini-3-pro',
        label: 'Gemini 3 Pro',
        description: 'Google Gemini model in Cursor.',
      },
    ],
    buildCommand({ model }) {
      const binary = process.env.BEVER_CURSOR_BIN?.trim() || 'cursor-agent';
      const args = model.trim() ? ['--model', model.trim()] : [];
      return [binary, ...args].join(' ');
    },
  },
];

export const clientProviderCatalog = providerCatalog.map(({ id, label, models }) => ({
  id,
  label,
  models,
}));

export function getProviderConfig(providerId: ProviderId): ProviderConfig {
  const provider = providerCatalog.find((entry) => entry.id === providerId);
  if (!provider) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }
  return provider;
}

export function getReasoningOptions(providerId: ProviderId, modelId: string): ReasoningEffort[] {
  const provider = getProviderConfig(providerId);
  return provider.models.find((model) => model.id === modelId)?.reasoningEfforts ?? [];
}
