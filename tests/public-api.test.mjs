import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFrequencyRequest, checkPublicQuota} from '../server/public-api.mjs';
import {generateFrequency} from '../server/generate.mjs';
import functionEntry from '../api/frequency.mjs';

const url = 'https://frequency-kappa.vercel.app/api/frequency';
const origin = 'https://frequency-kappa.vercel.app';
const env = {
  GEMINI_API_KEY: 'synthetic-server-key',
  KV_REST_API_URL: 'https://synthetic-redis.example.invalid',
  KV_REST_API_TOKEN: 'synthetic-redis-token',
  FREQUENCY_RATE_LIMIT_SECRET: 'synthetic-secret-of-at-least-32-characters',
};
const valid = {
  frequency: 432,
  title: '비 오는 창가',
  description: '잔잔한 물방울 같은 음색을 감상하세요.',
  color1: '#20243A',
  color2: '#52617C',
};
function request(body = {theme: '비 오는 밤'}, headers = {}) {
  return new Request(url, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('Vercel entry exports the web fetch handler', () => {
  assert.equal(typeof functionEntry.fetch, 'function');
});

test('malformed public requests never reach quota or model', async () => {
  let quotaCalls = 0;
  let modelCalls = 0;
  const options = {
    env,
    quota: async () => { quotaCalls++; return 'allowed'; },
    generate: async () => { modelCalls++; return valid; },
  };
  const cases = [
    [new Request(url, {method: 'GET'}), 405],
    [request(undefined, {Origin: 'https://evil.invalid'}), 403],
    [request(undefined, {'Content-Type': 'text/plain'}), 415],
    [request({theme: ''}), 400],
    [request({theme: 'x'.repeat(121)}), 400],
    [request({theme: 'x'.repeat(8200)}), 413],
  ];
  for (const [input, expected] of cases) {
    const result = await handleFrequencyRequest(input, options);
    assert.equal(result.status, expected);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  assert.equal(quotaCalls, 0);
  assert.equal(modelCalls, 0);
});

test('missing key or quota fails closed; quota rejection is 429', async () => {
  let modelCalls = 0;
  const generate = async () => { modelCalls++; return valid; };
  assert.equal((await handleFrequencyRequest(request(), {env: {}, generate})).status, 503);
  assert.equal((await handleFrequencyRequest(request(), {env, quota: async () => 'unavailable', generate})).status, 503);
  assert.equal((await handleFrequencyRequest(request(), {env, quota: async () => 'limited', generate})).status, 429);
  assert.equal(modelCalls, 0);
});

test('allowed request uses server key and only returns normalized result', async () => {
  let received;
  const response = await handleFrequencyRequest(request(), {
    env,
    quota: async () => 'allowed',
    generate: async (theme, options) => {
      received = {theme, options};
      return valid;
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), valid);
  assert.deepEqual(received, {theme: '비 오는 밤', options: {apiKey: env.GEMINI_API_KEY, model: undefined}});
});

test('shared Gemini generation validates model output', async () => {
  const fakeAi = {models: {generateContent: async () => ({text: JSON.stringify(valid)})}};
  assert.deepEqual(await generateFrequency('비 오는 밤', {ai: fakeAi}), valid);
  const badAi = {models: {generateContent: async () => ({text: JSON.stringify({...valid, description: '불면증을 치료합니다.'})})}};
  await assert.rejects(generateFrequency('비 오는 밤', {ai: badAi}));
});

test('atomic Redis quota uses hashed identity and rejects failures', async () => {
  let command;
  const fetchImpl = async (_url, init) => {
    command = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, `Bearer ${env.KV_REST_API_TOKEN}`);
    return Response.json({result: 1});
  };
  assert.equal(await checkPublicQuota(request(), {env, fetchImpl, now: 1_700_000_000_000}), 'allowed');
  assert.equal(command[0], 'EVAL');
  assert.equal(command[2], 3);
  assert.equal(command.slice(3, 6).length, 3);
  assert.ok(!JSON.stringify(command).includes('203.0.113.10'));
  assert.equal(await checkPublicQuota(request(), {
    env,
    fetchImpl: async () => Response.json({result: 0}),
  }), 'limited');
  assert.equal(await checkPublicQuota(request(), {
    env,
    fetchImpl: async () => { throw new Error('Redis down'); },
  }), 'unavailable');
  assert.equal(await checkPublicQuota(request(undefined, {'x-forwarded-for': 'invalid'}), {env, fetchImpl}), 'unavailable');
});
