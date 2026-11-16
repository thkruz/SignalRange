/**
 * The one place that talks to the Gemini API (@google/genai). One request per image, never retried.
 */
import { GoogleGenAI } from '@google/genai';

export function makeClient(apiKey, timeoutMs = 180000) {
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1, httpStatusCodes: [] } } });
}

/**
 * Generate one image. `references` is [{ data: Buffer, mimeType }] sent before the prompt.
 * `imageSize` ('1K' | '2K') is only sent when given (gemini-3-pro-image).
 * Returns { png, mimeType, usage, text, modelVersion }. Throws when the API errors or returns no image.
 */
export async function generateImage(ai, { model, prompt, references = [], aspectRatio = '1:1', imageSize }) {
  const parts = references.map((r) => ({ inlineData: { mimeType: r.mimeType ?? 'image/png', data: r.data.toString('base64') } }));
  parts.push({ text: prompt });
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio, ...(imageSize ? { imageSize } : {}) } },
  });
  const cand = res.candidates?.[0];
  const img = cand?.content?.parts?.find((p) => p.inlineData?.data);
  const text =
    cand?.content?.parts
      ?.filter((p) => p.text)
      .map((p) => p.text)
      .join(' ') || null;
  const usage = res.usageMetadata ?? null;
  if (!img) {
    const why = res.promptFeedback?.blockReason ?? cand?.finishReason ?? 'no image in response';
    const err = new Error(`model returned no image (${why})${text ? `: ${text.slice(0, 300)}` : ''}`);
    err.usage = usage;
    throw err;
  }
  return { png: Buffer.from(img.inlineData.data, 'base64'), mimeType: img.inlineData.mimeType, usage, text, modelVersion: res.modelVersion ?? null };
}
