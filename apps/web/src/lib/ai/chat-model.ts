import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";

export function hasChatLlmConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
}

export function getChatModel() {
  if (process.env.GROQ_API_KEY?.trim()) {
    const modelId = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
    return groq(modelId);
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    const modelId = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4.1-mini";
    return openai(modelId);
  }
  throw new Error("No LLM API key: set GROQ_API_KEY or OPENAI_API_KEY");
}
