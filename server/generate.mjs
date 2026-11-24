import {GoogleGenAI, Type} from '@google/genai';
import {frequencyPrompt, normalizeFrequencyData} from './core.mjs';

export async function generateFrequency(theme, {apiKey, model, ai} = {}) {
  if (!apiKey && !ai) throw new Error('Gemini API key is missing');
  const client = ai || new GoogleGenAI({apiKey});
  const response = await client.models.generateContent({
    model: model || 'gemini-3-flash-preview',
    contents: frequencyPrompt(theme),
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          frequency: {type: Type.NUMBER},
          title: {type: Type.STRING},
          description: {type: Type.STRING},
          color1: {type: Type.STRING},
          color2: {type: Type.STRING},
        },
        required: ['frequency', 'title', 'description', 'color1', 'color2'],
      },
    },
  });
  return normalizeFrequencyData(JSON.parse(response.text || 'null'));
}
