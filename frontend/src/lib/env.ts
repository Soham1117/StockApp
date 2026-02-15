/**
 * Environment variables with validation
 */

function getEnvVar(name: string, required: boolean = true): string {
  const value = process.env[name];

  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value || '';
}

export const env = {
  finnhubApiKey: getEnvVar('FINNHUB_API_KEY', false),
  secUserAgent: getEnvVar('SEC_USER_AGENT', false),
  fastapiBaseUrl: getEnvVar('FASTAPI_BASE_URL', false),
  // LLM configuration for research reports
  openaiApiKey: getEnvVar('OPENAI_API_KEY', false),
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  nodeEnv: getEnvVar('NODE_ENV', false) || 'development',
} as const;

/**
 * Validate that all required API keys are present
 */
export function validateEnv(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!env.finnhubApiKey) missing.push('FINNHUB_API_KEY');
  if (!env.secUserAgent) missing.push('SEC_USER_AGENT');
  if (!env.fastapiBaseUrl) missing.push('FASTAPI_BASE_URL');

  return {
    valid: missing.length === 0,
    missing,
  };
}
