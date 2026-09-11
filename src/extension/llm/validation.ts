import { z } from 'zod';
import { LLMResponse } from './types';

const chapterRecommendationSchema = z.object({
  title: z.string(),
  briefing: z.string(),
  filePaths: z.array(z.string()).default([]),
  symbolIds: z.array(z.string()).optional(),
});

const llmResponseSchema = z.object({
  summary: z.string(),
  howToReview: z.string().default(''),
  chapters: z.array(chapterRecommendationSchema).default([]),
});

export function validateLLMResponse(data: unknown): LLMResponse {
  try {
    return llmResponseSchema.parse(data) as LLMResponse;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('LLM response validation failed:', error.errors);
      throw new Error(`Invalid LLM response: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
}
