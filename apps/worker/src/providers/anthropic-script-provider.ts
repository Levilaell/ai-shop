/**
 * Claude implementation of ScriptProvider (spec §7). Uses the Anthropic
 * Messages API with **forced tool use** to obtain structured JSON: we declare a
 * single tool whose `input_schema` is the angle schema and force `tool_choice`
 * to it, so the model's `tool_use.input` is already a parsed, schema-shaped
 * object — no prefill, no brittle regex, and supported across SDK versions.
 *
 * Model defaults to Opus 4.8 (`claude-opus-4-8`), overridable via SCRIPT_MODEL.
 * Opus 4.8 rejects temperature/top_p/top_k and `budget_tokens`; we send none.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  buildScriptPrompt,
  parseAngles,
  SCRIPT_OUTPUT_SCHEMA,
  type GeneratedAngle,
  type ScriptGenerationRequest,
  type ScriptProvider,
} from '@ai-shop/shared';

export const DEFAULT_SCRIPT_MODEL = 'claude-opus-4-8';

const TOOL_NAME = 'emit_script_angles';

export class AnthropicScriptProvider implements ScriptProvider {
  readonly model: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model: string = process.env['SCRIPT_MODEL'] ?? DEFAULT_SCRIPT_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(req: ScriptGenerationRequest): Promise<GeneratedAngle[]> {
    const { system, user } = buildScriptPrompt(req);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system,
      tools: [
        {
          name: TOOL_NAME,
          description: 'Retorna os ângulos de roteiro gerados, no formato exigido.',
          input_schema: SCRIPT_OUTPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: user }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Claude recusou a geração de roteiro (stop_reason=refusal)');
    }

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    );
    if (!toolUse) throw new Error('Resposta do Claude sem tool_use de roteiro');

    return parseAngles(toolUse.input, req.variants);
  }
}
