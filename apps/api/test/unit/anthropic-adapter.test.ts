import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicLlm, LlmRefusalError, LlmTransientError } from '../../src/providers/llm/anthropic.js';

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('Anthropic adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends no sampling parameters, a low effort and the key only as a header', async () => {
    const fetch = reply({ content: [{ type: 'thinking' }, { type: 'text', text: '{"answer":"A"}' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } });
    vi.stubGlobal('fetch', fetch);
    const out = await new AnthropicLlm('sk-ant-test', 'claude-opus-5').complete('sys', 'user', 2000);
    expect(out).toEqual({ text: '{"answer":"A"}', inputTokens: 10, outputTokens: 5 });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.model).toBe('claude-opus-5');
    expect(JSON.stringify(body)).not.toContain('sk-ant-test');
  });

  it('reports a refusal and treats overload as worth one retry', async () => {
    vi.stubGlobal('fetch', reply({ content: [], stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 } }));
    await expect(new AnthropicLlm('k', 'm').complete('s', 'u', 10)).rejects.toBeInstanceOf(LlmRefusalError);
    vi.stubGlobal('fetch', reply({ error: {} }, 529));
    await expect(new AnthropicLlm('k', 'm').complete('s', 'u', 10)).rejects.toBeInstanceOf(LlmTransientError);
  });
});
