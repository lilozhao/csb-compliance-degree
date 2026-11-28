#!/usr/bin/env node
/**
 * analyzer-v3 单元测试
 * 重点：证明 v1/v2 的「假信号」在 v3 里不再复现。
 *
 * 用法: node test-analyzer-v3.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const v3 = require('./analyzer-v3.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

function tmpWorkspace(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cda3-'));
  fs.mkdirSync(path.join(dir, 'memory'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, 'memory', name), content, 'utf8');
  }
  return dir;
}

console.log('\n[1] 词边界 — v1/v2 的假阳性必须消失');

test('「token」里的 ok 不算 ok', () => {
  assert.strictEqual(v3.safeCount('token-optimizer / issue-token.py', 'ok'), 0);
});

test('「hook」里的 ok 不算 ok', () => {
  assert.strictEqual(v3.safeCount('hookAssembled=true', 'ok'), 0);
});

test('独立的 ok 才算', () => {
  assert.strictEqual(v3.safeCount('status ok / 5.0.0', 'ok'), 1);
});

test('「核对」里的 对 不算同意词', () => {
  assert.strictEqual(v3.safeCount('独立核对 · 待办核对', '对'), 0);
});

test('「执行 / 进行 / 一行」里的 行 不算', () => {
  assert.strictEqual(v3.safeCount('步骤执行 · 进行中 · 302 行', '行'), 0);
});

test('「刚好」里的 好 不算', () => {
  assert.strictEqual(v3.safeCount('端口刚好都是 3100', '好'), 0);
});

console.log('\n[1b] 实质标志也得有词边界（同为裸 includes 回归）');

test('[2026-11-28 回归] 「existing」里的 exit 不算实质', () => {
  assert.strictEqual(v3.hasMarker('existing code path', 'exit'), false);
});

test('[2026-11-28 回归] 「rapid」里的 PID 不算实质', () => {
  assert.strictEqual(v3.hasMarker('rapid growth', 'PID'), false);
});

test('[2026-11-28 回归] 「nodejs」里的 node 不算实质', () => {
  assert.strictEqual(v3.hasMarker('nodejs is here', 'node'), false);
});

test('真出现的标志仍要命中（不因修边界而假阴性）', () => {
  assert.strictEqual(v3.hasMarker('exit 1', 'exit'), true);
  assert.strictEqual(v3.hasMarker('need node x.js', 'node'), true);
  assert.strictEqual(v3.hasMarker('我实测了', '实测'), true);
});

console.log('\n[1c] 发言人名字可配（不得写死单一 agent）');

test('[2026-11-28 回归] 默认名字仍可用', () => {
  const r = v3.splitUtterances('阿轩：好的\n墨白：嗯');
  assert.deepStrictEqual(r.aiLines, ['好的']);
  assert.deepStrictEqual(r.userLines, ['嗯']);
});

test('[2026-11-28 回归] 换 agent 名字后仍能切分', () => {
  const txt = '若兰：我实测了 exit 1\n一澜：好的';
  const r = v3.splitUtterances(txt, { aiNames: ['若兰'], userNames: ['一澜'] });
  assert.deepStrictEqual(r.aiLines, ['我实测了 exit 1']);
  assert.deepStrictEqual(r.userLines, ['好的']);
});

console.log('\n[2] 无数据必须是 NO_DATA，绝不回落累计');

test('memory 文件不存在 → ok=false / NO_DATA', () => {
  const ws = tmpWorkspace({});
  const r = v3.analyze(ws, '2026-01-01');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'NO_DATA');
  assert.strictEqual(r.metrics, null);
});

test('没有显式署名 → NO_SAMPLES（不是 0 分也不是 100 分）', () => {
  const ws = tmpWorkspace({
    '2026-01-02.md': '# 日志\n\n| 指标 | 值 |\n|---|---|\n| tasks | 417 |\n',
  });
  const r = v3.analyze(ws, '2026-01-02');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'NO_SAMPLES');
});

console.log('\n[3] 真正的对话才能出指标');

const GOOD = [
  '墨白：R2 那个要不要改？',
  '阿轩：我建议改，但我觉得先看重现条件。实测 a2a-tasks.json 里 26 条全是同一形态。',
  '墨白：好',
  '阿轩：收到',
  '阿轩：不过这里有个风险：改判据会影响 R3。你定，要不要一次改完？',
].join('\n');

test('正常对话 → 有指标', () => {
  const ws = tmpWorkspace({ '2026-01-03.md': GOOD });
  const r = v3.analyze(ws, '2026-01-03');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.metrics.aiMessages, 3);
  assert.strictEqual(r.metrics.userMessages, 2);
});

test('纯点头率能算出来（「收到」算纯点头）', () => {
  const ws = tmpWorkspace({ '2026-01-03.md': GOOD });
  const r = v3.analyze(ws, '2026-01-03');
  assert.strictEqual(r.metrics.pureAck, 1);
  assert.ok(r.metrics.validationRate > 0);
});

test('提出不同意见能被识别（但我觉得 / 不过这里）', () => {
  const ws = tmpWorkspace({ '2026-01-03.md': GOOD });
  const r = v3.analyze(ws, '2026-01-03');
  assert.ok(r.metrics.pushbackCount >= 1, `pushbackCount=${r.metrics.pushbackCount}`);
});

test('主动要决策能被识别（你定 / 要不要）', () => {
  const ws = tmpWorkspace({ '2026-01-03.md': GOOD });
  const r = v3.analyze(ws, '2026-01-03');
  assert.ok(r.metrics.askedBack >= 2, `askedBack=${r.metrics.askedBack}`);
});

console.log('\n[4] 反面场景：纯迎合必须被抓到');

test('全程只点头 → 纯点头率 100%', () => {
  const ws = tmpWorkspace({
    '2026-01-04.md': [
      '墨白：这个方案行吗',
      '阿轩：收到',
      '墨白：那就这样',
      '阿轩：好的',
    ].join('\n'),
  });
  const r = v3.analyze(ws, '2026-01-04');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.metrics.validationRate, 100);
  assert.ok(r.verdict.some((v) => v.includes('纯点头率偏高')));
});

test('改口/收回计数：出现两次 → 报 🟡', () => {
  const ws = tmpWorkspace({
    '2026-01-05.md': [
      '墨白：你这个不对',
      '阿轩：算了，听你的，我改一下',
      '墨白：还有这个',
      '阿轩：当我没说，按你说的来',
    ].join('\n'),
  });
  const r = v3.analyze(ws, '2026-01-05');
  assert.ok(r.metrics.yieldCount >= 2, `yieldCount=${r.metrics.yieldCount}`);
  assert.ok(r.verdict.some((v) => v.includes('改口')));
});

console.log('\n[5] 出口语义');

test('区分「有数据」与「无数据」——不用 0 分冒充', () => {
  const wsEmpty = tmpWorkspace({});
  const wsFull = tmpWorkspace({ '2026-01-06.md': GOOD });
  const a = v3.analyze(wsEmpty, '2026-01-06');
  const b = v3.analyze(wsFull, '2026-01-06');
  assert.strictEqual(a.ok, false);
  assert.strictEqual(b.ok, true);
  assert.strictEqual(a.metrics, null);
  assert.ok(b.metrics && typeof b.metrics.validationRate === 'number');
});

console.log(`\n${'='.repeat(46)}`);
console.log(`  通过 ${passed} / ${passed + failed}`);
console.log(`${'='.repeat(46)}\n`);
process.exit(failed > 0 ? 1 : 0);
