import test from 'node:test';
import assert from 'node:assert/strict';
import {frequencyPrompt, normalizeFrequencyData, readTheme} from '../server/core.mjs';

const valid = {
  frequency: 432,
  title: '비 오는 창가',
  description: '잔잔한 물방울 같은 음색을 천천히 감상하세요.',
  color1: '#20243A',
  color2: '#52617C',
};

test('theme is trimmed and bounded before any model call', () => {
  assert.equal(readTheme('  비 오는   창가  '), '비 오는 창가');
  assert.equal(readTheme(''), null);
  assert.equal(readTheme('x'.repeat(121)), null);
  assert.equal(readTheme(42), null);
});

test('structured model output accepts only safe audio and color values', () => {
  assert.deepEqual(normalizeFrequencyData(valid), valid);
  assert.throws(() => normalizeFrequencyData({...valid, frequency: 0}));
  assert.throws(() => normalizeFrequencyData({...valid, frequency: 20000}));
  assert.throws(() => normalizeFrequencyData({...valid, color1: 'red; background:url(x)'}));
  assert.throws(() => normalizeFrequencyData({...valid, title: ''}));
});

test('medical and fortune efficacy claims are rejected', () => {
  assert.throws(() => normalizeFrequencyData({...valid, description: '불면증을 치료합니다.'}));
  assert.throws(() => normalizeFrequencyData({...valid, description: '연애운이 좋아집니다.'}));
  assert.throws(() => normalizeFrequencyData({...valid, title: '치유 주파수'}));
  assert.match(frequencyPrompt('비 오는 밤'), /효능 설명은 쓰지 마세요/);
});
