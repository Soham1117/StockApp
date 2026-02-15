import { env } from '@/lib/env';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export class LLMConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMConfigurationError';
  }
}

export async function generateChatCompletion(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!env.openaiApiKey) {
    throw new LLMConfigurationError(
      'OpenAI API key not configured. Set OPENAI_API_KEY in your environment to enable research reports.'
    );
  }

  const body = {
    model: env.openaiModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ] satisfies ChatMessage[],
    temperature: 0.2,
    max_tokens: 4000, // Increased for comprehensive research reports (1200-1800 words target)
  };

  // Debug: Log if prompt contains DCF data

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText} - ${text.slice(0, 500)}`
    );
  }

  const json = (await response.json()) as OpenAIChatResponse;
  const content = json.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OpenAI API returned an empty response.');
  }


  return content.trim();
}

