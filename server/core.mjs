const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function readTheme(value) {
  if (typeof value !== 'string') return null;
  const theme = value.trim().replace(/\s+/g, ' ');
  return theme.length > 0 && theme.length <= 120 ? theme : null;
}

export function normalizeFrequencyData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI response is not an object');
  }
  const {frequency, title, description, color1, color2} = value;
  if (!Number.isFinite(frequency) || frequency < 100 || frequency > 800) {
    throw new Error('AI response has an invalid frequency');
  }
  if (typeof title !== 'string' || !title.trim() || title.length > 80) {
    throw new Error('AI response has an invalid title');
  }
  if (typeof description !== 'string' || !description.trim() || description.length > 280) {
    throw new Error('AI response has an invalid description');
  }
  if (/(치유|치료|완치|질병|증상|불면증|우울증|연애운|재물운|건강\s*효과|수면\s*개선|집중력\s*향상)/.test(title + ' ' + description)) {
    throw new Error('AI response contains an unsupported efficacy claim');
  }
  if (typeof color1 !== 'string' || !HEX_COLOR.test(color1) ||
      typeof color2 !== 'string' || !HEX_COLOR.test(color2)) {
    throw new Error('AI response has invalid colors');
  }
  return {
    frequency: Math.round(frequency),
    title: title.trim(),
    description: description.trim(),
    color1,
    color2,
  };
}

export function frequencyPrompt(theme) {
  return [
    '사용자가 선택한 테마에 어울리는 감상용 신시사이저 사운드를 기획하세요.',
    '기본 음높이 100~800 Hz 사이의 숫자 하나, 짧은 제목, 280자 이하의 감상 설명, 어두운 화면에 어울리는 6자리 HEX 색상 두 개를 JSON으로 반환하세요.',
    '특정 주파수가 질병, 수면, 집중, 운세, 심리 상태를 치료하거나 개선한다는 주장과 과학적 효능 설명은 쓰지 마세요.',
    '테마: ' + theme,
  ].join('\n');
}
