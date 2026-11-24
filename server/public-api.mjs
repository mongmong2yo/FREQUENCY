import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {generateFrequency} from './generate.mjs';
import {readTheme} from './core.mjs';

const MAX_BODY_BYTES = 8192;
const BURST_WINDOW_MS = 10 * 60 * 1000;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const BURST_LIMIT = 5;
const IP_DAILY_LIMIT = 20;
const GLOBAL_DAILY_LIMIT = 100;
const QUOTA_SCRIPT = `
for i = 1, 3 do
  local count = tonumber(redis.call('GET', KEYS[i]) or '0')
  if count >= tonumber(ARGV[i]) then return 0 end
end
for i = 1, 3 do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('EXPIRE', KEYS[i], tonumber(ARGV[i + 3])) end
end
return 1
`;

function json(status, body) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...(status === 405 ? {Allow: 'POST'} : {}),
    },
  });
}

async function readBody(request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return 'too-large';
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  } catch {
    return null;
  }
}

export async function checkPublicQuota(request, {env = process.env, fetchImpl = fetch, now = Date.now()} = {}) {
  const redisUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const redisToken = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  // The Redis token is server-only and supplies a stable, high-entropy HMAC key.
  // Domain separation keeps this pseudonym unrelated to other uses of the token.
  const secret = env.FREQUENCY_RATE_LIMIT_SECRET || redisToken;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!redisUrl || !redisToken || !secret || !ip || !isIP(ip)) return 'unavailable';
  let url;
  try {
    url = new URL(redisUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return 'unavailable';
  } catch {
    return 'unavailable';
  }

  const client = createHmac('sha256', secret).update(`frequency:ip:v1:${ip}`).digest('hex');
  const burst = Math.floor(now / BURST_WINDOW_MS);
  const day = Math.floor(now / DAILY_WINDOW_MS);
  const keys = [
    `frequency:v1:burst:${client}:${burst}`,
    `frequency:v1:day:${client}:${day}`,
    `frequency:v1:global:${day}`,
  ];
  try {
    const response = await fetchImpl(url.href, {
      method: 'POST',
      headers: {'Authorization': `Bearer ${redisToken}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(['EVAL', QUOTA_SCRIPT, keys.length, ...keys,
        BURST_LIMIT, IP_DAILY_LIMIT, GLOBAL_DAILY_LIMIT, 600, 86400, 86400]),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return 'unavailable';
    const data = await response.json();
    if (data?.error || (data?.result !== 0 && data?.result !== 1)) return 'unavailable';
    return data.result === 1 ? 'allowed' : 'limited';
  } catch {
    return 'unavailable';
  }
}

export async function handleFrequencyRequest(request, {
  env = process.env,
  quota = checkPublicQuota,
  generate = generateFrequency,
} = {}) {
  if (request.method !== 'POST') return json(405, {error: 'POST 요청만 사용할 수 있습니다.'});
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return json(403, {error: '허용되지 않은 요청입니다.'});
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    return json(415, {error: 'JSON 요청만 사용할 수 있습니다.'});
  }
  const declaredSize = Number(request.headers.get('content-length'));
  if (declaredSize > MAX_BODY_BYTES) return json(413, {error: '요청이 너무 큽니다.'});
  const body = await readBody(request);
  if (body === 'too-large') return json(413, {error: '요청이 너무 큽니다.'});
  const theme = readTheme(body?.theme);
  if (!theme) return json(400, {error: '테마를 1~120자로 입력해 주세요.'});
  if (!env.GEMINI_API_KEY) return json(503, {error: '사운드 생성 기능을 준비하고 있습니다.'});

  const quotaResult = await quota(request, {env});
  if (quotaResult === 'limited') return json(429, {error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.'});
  if (quotaResult !== 'allowed') return json(503, {error: '사운드 생성 기능을 잠시 사용할 수 없습니다.'});
  try {
    const data = await generate(theme, {apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL});
    return json(200, data);
  } catch {
    console.error('Frequency generation failed');
    return json(502, {error: '사운드를 만들지 못했습니다. 다시 시도해 주세요.'});
  }
}
