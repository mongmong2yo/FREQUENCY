export interface FrequencyData {
  frequency: number;
  title: string;
  description: string;
  color1: string;
  color2: string;
}

export async function getFrequencyData(theme: string): Promise<FrequencyData> {
  const response = await fetch('/api/frequency', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({theme}),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload &&
      typeof payload.error === 'string' ? payload.error : '사운드를 만들지 못했습니다. 다시 시도해 주세요.';
    throw new Error(message);
  }
  return payload as FrequencyData;
}
