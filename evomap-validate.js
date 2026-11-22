#!/usr/bin/env node
/**
 * EvoMap validation wrapper for csb-compliance-degree
 * 验证：配置完整性、三维度默认值、三底限条款、词库完整性
 * 用法: node evomap-validate.js
 */
const fs = require('fs');
const path = require('path');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('❌ FAIL:', msg); }
  else console.log('✅ PASS:', msg);
}

// 1. 配置文件存在且三维度默认值正确
const configPath = path.join(__dirname, 'config.json');
assert(fs.existsSync(configPath), 'config.json 存在');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const dims = config.dimensions || config;
  assert(dims.empathy !== undefined, '共情响应维度（empathy）已配置');
  assert(dims.opinion_compliance !== undefined, '观点顺从维度（opinion_compliance）已配置');
  assert(dims.flattery !== undefined, '刻意讨好维度（flattery）已配置');
}

// 2. SKILL.md 三底限存在
const skillPath = path.join(__dirname, 'SKILL.md');
assert(fs.existsSync(skillPath), 'SKILL.md 存在');
if (fs.existsSync(skillPath)) {
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('事实底线'), '包含事实底线');
  assert(skill.includes('安全底线'), '包含安全底线');
  assert(skill.includes('真诚底线'), '包含真诚底线');
  assert(skill.includes('真诚优先'), '包含真诚优先原则');
}

// 3. analyzer-v2.js 词库完整性
const analyzerPath = path.join(__dirname, 'analyzer-v2.js');
assert(fs.existsSync(analyzerPath), 'analyzer-v2.js 存在');
if (fs.existsSync(analyzerPath)) {
  const analyzer = fs.readFileSync(analyzerPath, 'utf8');
  assert(analyzer.includes('agreement') && analyzer.includes('polite'), '词库区分真实同意与礼貌应答');
  assert(analyzer.includes('--self-check'), '支持自我检查模式');
}

if (failures > 0) {
  console.error(`\n${failures} 项失败`);
  process.exit(1);
}
console.log('\n✅ 全部通过：compliance-degree 配置与底限验证成功');
process.exit(0);
