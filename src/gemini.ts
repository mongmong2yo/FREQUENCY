import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface FrequencyData {
  frequency: number;
  title: string;
  description: string;
  color1: string;
  color2: string;
}

export async function getFrequencyData(theme: string): Promise<FrequencyData> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `사용자가 다음 테마에 맞는 주파수 음악을 원합니다: "${theme}". 
    이 테마에 가장 적합한 치유 주파수(예: 396Hz, 417Hz, 432Hz, 528Hz, 639Hz, 741Hz, 852Hz 등)를 하나 선택하고, 제목과 설명을 작성해주세요.
    배경색으로 쓸 만한 어울리는 색상 해시코드 2개도 제안해주세요. 어두운 배경에 어울리는 딥하고 몽환적인 색상으로 부탁합니다.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          frequency: { type: Type.NUMBER, description: "적합한 주파수 (Hz)" },
          title: { type: Type.STRING, description: "음악 제목" },
          description: { type: Type.STRING, description: "주파수의 효과와 감상 팁" },
          color1: { type: Type.STRING, description: "배경색 1 (Hex, 예: #2a0845)" },
          color2: { type: Type.STRING, description: "배경색 2 (Hex, 예: #6441A5)" }
        },
        required: ["frequency", "title", "description", "color1", "color2"]
      }
    }
  });
  return JSON.parse(response.text) as FrequencyData;
}
