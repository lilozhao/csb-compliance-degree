/**
 * 判据指纹自检（P1-4 · csb-compliance-degree 侧）
 *
 * 本仓的判据全在 config.json 里：dimensions / limits / modes / words。
 * 这三类东西改一个词、改一个边界，历史分析结论就不再可比。
 * 但 config.json 里还有 statistics（累计对话数/命中数）—— 那是**运行时状态**，
 * 每天在变。把它算进指纹，等于每天自动作废全部历史结论。
 *
 * 所以：指纹只覆盖判据，显式排除状态。
 * 判据字段清单与实现同在 csb-aep/server/engine/criteria.js（单一真源，避免两套口径）。
 *
 * 用法：
 *   node criteria-check.js           # 核对
 *   node criteria-check.js --fix     # 改完判据后重算写回
 *   node criteria-check.js --json
 *
 * 改判据的正确流程：
 *   1. 改 config.json 的 dimensions/words/modes/limits
 *   2. config_version +1（判据版本，独立于 package version）
 *   3. node criteria-check.js --fix
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CFG = path.join(__dirname, 'config.json');
// 判据实现放在 csb-aep（评测侧消费者），本仓通过相对路径引用。
// 找不到时**不静默跳过** —— 静默跳过等于永远不检查，比报错更糟。
const CRITERIA_PATHS = [
  path.join(__dirname, '..', 'csb-aep', 'server', 'engine', 'criteria.js'),
];

function loadCriteria() {
  for (const p of CRITERIA_PATHS) {
    if (fs.existsSync(p)) return require(p);
  }
  console.error('🔴 找不到判据实现（csb-aep/server/engine/criteria.js）');
  console.error('   本仓判据指纹依赖它；缺失时无法核对，不作为"通过"处理。');
  process.exit(2);
}

const C = loadCriteria();
const AS_JSON = process.argv.includes('--json');
const FIX = process.argv.includes('--fix');

const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const fp = C.fingerprint(cfg);
const stored = cfg.config_hash || null;
const ok = stored === fp.hash;

if (FIX) {
  cfg.config_hash = fp.hash;
  fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`🔧 config_hash 已重算 → ${fp.hash}`);
  console.log(`   判据版本 config_version=${fp.version}`);
  process.exit(0);
}

const result = {
  ok,
  file: 'config.json',
  packageVersion: cfg.version,
  configVersion: fp.version,
  stored,
  computed: fp.hash,
  criteriaFields: fp.fields,
  leafCount: fp.counts,
  excludedState: C.STATE_FIELDS.filter((k) => k in cfg),
};

if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
}

console.log(ok ? '✅ 判据指纹一致' : '🔴 判据指纹不一致');
console.log(`   package ${cfg.version} · 判据版本 ${fp.version}`);
console.log(`   覆盖 ${fp.fields.length} 类判据（${fp.counts} 个叶子值）：${fp.fields.join('、')}`);
console.log(`   已排除运行时状态：${result.excludedState.join('、') || '(无)'}`);
if (!ok) {
  console.log(`   存储 ${stored || '(无)'}  vs  实算 ${fp.hash}`);
  console.log('   改了判据但没重算 → 旧结论会被错误地当成可比。跑：node criteria-check.js --fix');
}
process.exit(ok ? 0 : 1);
