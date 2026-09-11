import * as vscode from 'vscode';
import { LLMConfig, LLMRequest, LLMResponse } from './types';
import { LLM_DEFAULTS, formatModelLabel } from './resolve';
import { validateLLMResponse } from './validation';
import { log, timed } from '../log';

export async function callLLM(
  request: LLMRequest,
  config: LLMConfig
): Promise<LLMResponse> {
  const prompt = config.provider === 'vscode' ? '' : buildPrompt(request);
  if (prompt) {
    log(`LLM prompt ${prompt.length} chars via ${formatModelLabel(config)}`);
  }

  const responseText = await timed('llm request', async () => {
    if (config.provider === 'vscode') {
      return callEditorModel(request, config);
    }
    if (config.provider === 'anthropic') {
      return callAnthropic(prompt, config);
    }
    if (config.provider === 'gemini') {
      return callGemini(prompt, config);
    }
    return callOpenAI(prompt, config);
  });

  if (!responseText.trim()) {
    throw new Error('The language model returned an empty response. Try regenerating the walkthrough.');
  }

  return parseLLMResponse(responseText);
}

async function callEditorModel(request: LLMRequest, config: LLMConfig): Promise<string> {
  const model = await selectLanguageModel(config);
  const prompt = await fitPrompt(model, request);
  log(`LLM prompt ${prompt.length} chars via ${formatModelLabel(config)} (${model.vendor}/${model.family})`);
  const response = await model.sendRequest(
    [vscode.LanguageModelChatMessage.User(prompt)],
    {},
    new vscode.CancellationTokenSource().token
  );

  let responseText = '';
  try {
    for await (const chunk of response.text) {
      responseText += chunk;
    }
  } catch (error) {
    throw mapLanguageModelError(error);
  }
  return responseText;
}

async function callOpenAI(prompt: string, config: LLMConfig): Promise<string> {
  if (!config.apiKey) {
    throw new Error('API key is missing. Open the walkthrough panel and set a model.');
  }

  const usingOpenRouter = config.provider === 'openrouter' || (config.baseUrl || '').includes('openrouter.ai');
  const base = (
    config.baseUrl
    || (usingOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1')
  ).replace(/\/$/, '');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (usingOpenRouter) {
    headers['HTTP-Referer'] = 'https://github.com';
    headers['X-Title'] = 'PR Walk';
  }

  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model || (usingOpenRouter ? LLM_DEFAULTS.openrouter.model : LLM_DEFAULTS.openai.model),
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Return only valid JSON that matches the requested schema.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const payload = await response.json() as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI request failed (${response.status})`);
  }
  return payload.choices?.[0]?.message?.content || '';
}

async function callAnthropic(prompt: string, config: LLMConfig): Promise<string> {
  if (!config.apiKey) {
    throw new Error('Anthropic API key is missing. Open the walkthrough panel and set a model.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'claude-haiku-4-5',
      max_tokens: 4096,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const payload = await response.json() as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Anthropic request failed (${response.status})`);
  }
  return payload.content?.filter((block) => block.type === 'text').map((block) => block.text || '').join('') || '';
}

async function callGemini(prompt: string, config: LLMConfig): Promise<string> {
  if (!config.apiKey) {
    throw new Error('Gemini API key is missing. Open the walkthrough panel and set a model.');
  }

  const model = (config.model || LLM_DEFAULTS.gemini.model).replace(/^models\//, '');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: 'Return only valid JSON that matches the requested schema.' }],
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  const payload = await response.json() as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini request failed (${response.status})`);
  }
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
}

async function selectLanguageModel(config: LLMConfig): Promise<vscode.LanguageModelChat> {
  const selector: vscode.LanguageModelChatSelector = {};
  if (config.vendor) {
    selector.vendor = config.vendor;
  }
  if (config.family) {
    selector.family = config.family;
  }

  let models = await vscode.lm.selectChatModels(selector);
  if (models.length === 0 && (config.vendor || config.family)) {
    models = await vscode.lm.selectChatModels();
  }

  if (models.length === 0) {
    throw new Error(
      'No editor language model is available. Cursor does not share its chat models with extensions — set an API key in the walkthrough panel.'
    );
  }

  return pickDefaultModel(models, config);
}

function pickDefaultModel(
  models: vscode.LanguageModelChat[],
  config: LLMConfig
): vscode.LanguageModelChat {
  if (config.family) {
    const exact = models.find((model) => model.family === config.family && (!config.vendor || model.vendor === config.vendor));
    if (exact) {
      return exact;
    }
  }

  const preferred = [
    'gpt-4o-mini',
    'gpt-4.1-mini',
    'gemini-flash',
    'claude-haiku',
    'haiku',
    'gpt-4o',
    'claude-sonnet',
    'sonnet',
  ];

  for (const family of preferred) {
    const match = models.find((model) => {
      const id = `${model.family} ${model.id} ${model.name}`.toLowerCase();
      return id.includes(family);
    });
    if (match) {
      return match;
    }
  }

  return models[0];
}

async function fitPrompt(
  model: vscode.LanguageModelChat,
  request: LLMRequest
): Promise<string> {
  const full = buildPrompt(request);
  try {
    const limit = Math.max(1024, Math.floor(model.maxInputTokens * 0.85));
    if (await model.countTokens(full) <= limit) {
      return full;
    }
  } catch {
    return full;
  }

  return buildPrompt({
    ...request,
    files: request.files.map((file) => ({ ...file, sampleDiff: '' })),
    contextFiles: request.contextFiles?.map((file) => ({ ...file, snippet: '' })),
  });
}

function mapLanguageModelError(error: unknown): Error {
  if (error instanceof vscode.LanguageModelError) {
    if (error.code === 'NoPermissions') {
      return new Error('This extension needs permission to use the editor language model.');
    }
    if (error.code === 'Blocked') {
      return new Error('The editor language model blocked this request. Try a smaller PR or regenerate.');
    }
    if (error.code === 'NotFound') {
      return new Error('The selected language model is not available. Set another model from the PR Walk status bar.');
    }
    return new Error(`Editor language model error: ${error.message}`);
  }

  return error instanceof Error ? error : new Error('Editor language model request failed.');
}

function buildPrompt(request: LLMRequest): string {
  const { prMetadata, treeText, entryPoints, leafNodes, files, contextFiles, userPrompt } = request;
  const allowedPaths = files.map((file) => file.path);

  let prompt = `You are walking a teammate through this PR. They have not been living in this code. They need the story of the change, not a tour of every line.

Short sentences. Clear words. You can name a function or type when it helps. Do not write like a design doc.

Summary / how to review — almost plain. One real name is fine.
Bad: "This opt-in migration refactors the table rendering abstraction."
Good: "Charts can switch to Table V2. Old tables keep working until someone switches them."

Chapters — a bit more technical. Say what the code does, and name the main function or type.
Bad: "People can use a new table."
Good: "TableChart now builds an AG Grid table. getTimeRangeFromGranularity feeds the time column."

## PR
- ${prMetadata.owner}/${prMetadata.repo} #${prMetadata.prNumber}: "${prMetadata.title}"

## How the change connects
Use this as a hint, not a script. You decide the chapters. Names marked [outside PR] did not change.

\`\`\`
${treeText}
\`\`\`

- Starts in: ${namedList(entryPoints)}
- Helpers: ${namedList(leafNodes)}

## Files you may attach
Copy paths and symbol ids exactly. Unknown values are dropped.

`;

  for (const file of files) {
    const symbols = file.symbolIds.length > 0 ? file.symbolIds.join(', ') : 'none';
    prompt += `### ${file.path}
- Kind: ${file.kind}
- Symbols: ${symbols}

\`\`\`diff
${file.sampleDiff}
\`\`\`

`;
  }

  if (contextFiles && contextFiles.length > 0) {
    prompt += `## Context from outside the PR
These files did not change. Use them only to understand callees. Do not put them in filePaths.

`;
    for (const file of contextFiles) {
      prompt += `### ${file.path}
- Symbols: ${file.symbolNames.join(', ') || 'none'}

\`\`\`
${file.snippet}
\`\`\`

`;
    }
  }

  if (userPrompt) {
    prompt += `## Extra focus from the reader
${userPrompt}

`;
  }

  prompt += `## Writing rules
1. summary: 2-3 short sentences. What changed, and why it matters. Almost plain. One code name is enough.
2. howToReview: 3 short numbered steps. Where to start, what to look at. Almost plain. You may name one function or file per step.
3. You own the chapters. Use 2-8. Each chapter is one idea. Put helpers, types, and styles with the feature they belong to. Do not leave related files out.
4. One chapter per file only when the files are truly unrelated.
5. filePaths must be copied from this list: ${allowedPaths.join(', ') || 'none'}
6. symbolIds are optional and must be copied from the lists above.
7. title: 2-6 words, can include a type or function name. briefing: 2 short sentences on what this code does. Slightly more technical than the summary. Do not narrate lines.
8. Tests and docs are optional. Skip them unless they are the point of the PR.
9. Files under "Context from outside the PR" must not appear in filePaths.
10. In summary and howToReview, do not say: call graph, entry point, callee, leftover, abstraction, plumbing, surface area.

## Response Format
Return ONLY valid JSON:
{
  "summary": "Two or three short sentences.",
  "howToReview": "1) ... 2) ... 3) ...",
  "chapters": [
    {
      "title": "Short title, can name a function",
      "briefing": "What this code does. Why it matters.",
      "filePaths": ["${allowedPaths[0] || 'src/example.ts'}"],
      "symbolIds": []
    }
  ]
}`;

  return prompt;
}

function namedList(items: Array<{ name: string; filePath: string }>): string {
  if (items.length === 0) {
    return 'none';
  }
  return items.map((item) => `${item.name} (${item.filePath})`).join(', ');
}

function parseLLMResponse(responseText: string): LLMResponse {
  try {
    const parsed = JSON.parse(extractJson(responseText));
    return validateLLMResponse(parsed);
  } catch (error) {
    console.error('Failed to parse LLM response:', error, responseText.slice(0, 500));
    const detail = error instanceof Error ? error.message : 'unknown parse error';
    throw new Error(`Invalid LLM response format: ${detail}`);
  }
}

function extractJson(responseText: string): string {
  const trimmed = responseText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  return trimmed;
}
