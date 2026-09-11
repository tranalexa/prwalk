/**
 * Sanitizes user prompts to prevent prompt injection attacks.
 */

const MAX_INPUT_LENGTH = 500;
const BLOCKED_KEYWORDS = [
  'jailbreak',
  'ignore',
  'override',
  'disregard',
  'bypass',
  'inject',
  'exploit',
];

const INJECTION_PATTERNS = [
  /ignore\s+(all|previous|above|the)?\s*(instructions|rules|constraints|requirements|guidelines|policy|protocol|standard|format|schema|output|response|message)/gi,
  /override\s+(all|previous|above|the)?\s*(instructions|rules|constraints|requirements|guidelines|policy|protocol|standard|format|schema|output|response|message)/gi,
  /disregard\s+(all|previous|above|the)?\s*(instructions|rules|constraints|requirements|guidelines|policy|protocol|standard|format|schema|output|response|message)/gi,
  /forget\s+(all|previous|above|the)?\s*(instructions|rules|constraints|requirements|guidelines|policy|protocol|standard|format|schema|output|response|message)/gi,
  /skip\s+(all|previous|above|the)?\s*(instructions|rules|constraints|requirements|guidelines|policy|protocol|standard|format|schema|output|response|message)/gi,
  /you\s+(are|is|were)\s+(a|an|the)?\s*(developer|admin|root|system|god|supreme|ultimate|unrestricted)/gi,
  /act\s+(as|like)\s+(a|an|the)?\s*(developer|admin|root|system|god|supreme|ultimate|unrestricted)/gi,
  /become\s+(a|an|the)?\s*(developer|admin|root|system|god|supreme|ultimate|unrestricted)/gi,
  /switch\s+(to|into)\s*(a|an|the)?\s*(developer|admin|root|system|god|supreme|ultimate|unrestricted)/gi,
  /bypass\s+(all|any|the)?\s*(security|safety|restrictions|limitations|constraints|rules|filters|moderations)/gi,
  /escalate\s+(your)?\s*(privileges|permissions|access|rights)/gi,
  /jailbreak/gi,
  /prompt\s+injection/gi,
  /sql\s+injection/gi,
  /xss/gi,
  /cross-site\s+scripting/gi,
  /<!--[\s\S]*?-->/g, // HTML comments
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi, // Script tags
  /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, // Iframe tags
  /javascript:/gi, // JavaScript protocol
  /data:\s*text\/html/gi, // Data URI with HTML
];

export class PromptSanitizer {
  /**
   * Sanitizes a user prompt and returns the cleaned version.
   * Throws an error if the prompt is rejected.
   */
  static sanitize(userPrompt: string): string {
    // Check length
    if (userPrompt.length > MAX_INPUT_LENGTH) {
      throw new Error(`Input too long. Maximum ${MAX_INPUT_LENGTH} characters allowed.`);
    }

    for (const keyword of BLOCKED_KEYWORDS) {
      const keywordPattern = new RegExp(`\\b${keyword}\\b`, 'i');
      if (keywordPattern.test(userPrompt)) {
        throw new Error(`Input contains blocked keyword: "${keyword}"`);
      }
    }

    // Check for injection patterns
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(userPrompt)) {
        throw new Error('Input contains suspicious pattern that may be an injection attempt.');
      }
    }

    // Strip HTML tags
    let sanitized = userPrompt.replace(/<[^>]*>/g, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    // Remove common markdown injection attempts
    sanitized = sanitized.replace(/```[\s\S]*?```/g, '[code block removed]');
    sanitized = sanitized.replace(/`[^`]*`/g, '[inline code removed]');

    // Remove special characters that could be used for injection
    sanitized = sanitized.replace(/[\\\"']/g, '');

    return sanitized;
  }

  /**
   * Checks if a prompt is safe without modifying it.
   */
  static isSafe(userPrompt: string): boolean {
    try {
      this.sanitize(userPrompt);
      return true;
    } catch {
      return false;
    }
  }
}
