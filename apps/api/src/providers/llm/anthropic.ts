import { z } from 'zod';

const URL_MESSAGES = 'https://api.anthropic.com/v1/messages';

export interface LlmReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** A failure worth one retry (rate limit, overload, timeout, network). */
export class LlmTransientError extends Error {}

/** The model declined the request (stop_reason "refusal"); not worth a retry. */
export class LlmRefusalError extends Error {}

const Reply = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  stop_reason: z.string().nullable().optional(),
  usage: z.object({ input_tokens: z.number().int(), output_tokens: z.number().int() }),
});

/**
 * Claude (Anthropic Messages API) behind LLM_API_KEY. No tools, no URLs, no files: plain text
 * in, text out. Current models reject sampling parameters (temperature, top_p), think before
 * answering by default, and take an effort level instead; the checks are short, so effort is
 * low and max_tokens leaves room for thinking plus the JSON reply. Question content is
 * private, so the API key and the provider's data terms must allow it (QC_PIPELINE "AI boundary").
 */
export class AnthropicLlm {
  readonly provider = 'anthropic';

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async complete(system: string, user: string, maxTokens: number): Promise<LlmReply> {
    let response: Response;
    try {
      response = await fetch(URL_MESSAGES, {
        method: 'POST',
        headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          output_config: { effort: 'low' },
          system,
          messages: [{ role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new LlmTransientError(error instanceof Error ? error.name : 'network error');
    }
    if (response.status === 429 || response.status >= 500) throw new LlmTransientError(`HTTP ${response.status}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const reply = Reply.parse(await response.json());
    if (reply.stop_reason === 'refusal') throw new LlmRefusalError('refusal');
    return {
      text: reply.content.map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join(''),
      inputTokens: reply.usage.input_tokens,
      outputTokens: reply.usage.output_tokens,
    };
  }
}
