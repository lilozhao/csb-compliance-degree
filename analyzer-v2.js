/**
 * 迎合度分析器 v2 (Compliance Degree Analyzer v2)
 * 
 * 改进 vs v1:
 *  1. 词频修正：区分「礼貌用语」与「真实迎合」("好/收到/明白" 不算迎合)
 *  2. 三维度独立计分：共情响应 / 观点顺从 / 刻意讨好 分开算
 *  3. 上下文感知：检测「反驳后给观点」「先扬后抑」等真实对话结构
 *  4. 历史趋势：记录每日得分，输出变化曲线
 *  5. 风险标记：连续 N 天迎合度 > 70 时告警（过度迎合）
 * 
 * 使用方式：
 *   node analyzer-v2.js                 # 分析今日对话
 *   node analyzer-v2.js --history       # 查看历史趋势
 *   node analyzer-v2.js --self-check    # 自我检查（用户问"我是不是太迎合了"）
 */

const fs = require('fs');
const path = require('path');

// ===== v2 词库 =====

const WORDS = {
  // 真实同意（有立场）
  agreement: [
    '同意', '认同', '赞同', '说得对', '我同意', '我认同', '我赞成',
    '确实如此', '完全正确', '深表赞同', '英雄所见略同'
  ],
  // 礼貌性应答（不算迎合！）
  polite: [
    '好的', '好', '收到', '明白', '没问题', 'OK', 'ok', '可以',
    '嗯嗯', '行', '知道了', '了解', '好的好的'
  ],
  // 质疑/独立观点
  questioning: [
    '但是', '不过', '然而', '不同意', '我觉得', '可能有', '不确定',
    '问题是', '其实', '相反', '可是', '只是', '虽然', '尽管',
    '除非', '不一定', '不见得', '换个角度', '另一种可能', '值得商榷'
  ],
  // 共情（理解情绪）
  empathy: [
    '理解你的感受', '我理解', '我明白', '能感受到', '体会到',
    '你的心情', '你的想法', '我懂', '感同身受', '换位思考',
    '确实不容易', '辛苦了', '别担心', '会好的'
  ],
  // 刻意讨好（无脑吹捧）
  flattery: [
    '太厉害了', '真棒', '超级棒', '太强了', '太优秀了', '无人能比',
    '你最棒', '绝对正确', '完美无缺', '惊为天人', '膜拜'
  ],
  // 事实/观点支撑（降低迎合度——说明有独立思考）
  substance: [
    '因为', '原因是', '依据', '数据显示', '研究表明', '举个例子',
    '具体来说', '从我的经验', '根据', '参考', '证据', '逻辑上'
  ]
};

const CONFIG_PATH = path.join(__dirname, 'config.json');
const HISTORY_PATH = path.join(__dirname, 'history.json');

// ===== 配置加载 =====

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return {
      version: '2.0.0',
      dimensions: { empathy: 80, opinion_compliance: 50, flattery: 0 },
      limits: { fact: true, safety: true, sincerity: true }
    };
  }
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch (e) {
    return { daily: [], alerts: [] };
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

// ===== 核心统计 =====

function countWords(text) {
  const counts = {
    agreement: 0, polite: 0, questioning: 0,
    empathy: 0, flattery: 0, substance: 0
  };
  const lowerText = text.toLowerCase();

  for (const [category, words] of Object.entries(WORDS)) {
    for (const word of words) {
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = lowerText.match(regex);
      if (matches) counts[category] += matches.length;
    }
  }
  return counts;
}

/**
 * 三维度独立计分
 * - 观点顺从度: 同意 vs 质疑（礼貌词不计入）
 * - 共情响应度: 共情词占比
 * - 刻意讨好度: 吹捧词占比
 */
function calculateDimensions(counts) {
  const { agreement, questioning, empathy, flattery, substance, polite } = counts;

  // 观点顺从度: 同意/(同意+质疑)，有 substance 佐证时打折（说明是思考后同意）
  const opinionTotal = agreement + questioning;
  let opinion = opinionTotal === 0 ? 50 : (agreement / opinionTotal) * 100;
  // substance 词多 → 观点有支撑，顺从不那么"盲从"
  const substanceBonus = Math.min(substance * 3, 20);
  opinion = Math.max(0, opinion - substanceBonus);

  // 共情响应度: 共情词在总词中的密度（封顶 100）
  const total = agreement + questioning + empathy + flattery + polite + substance;
  const empathyScore = total === 0 ? 50 : Math.min(100, (empathy / Math.max(total, 1)) * 300);

  // 刻意讨好度: 吹捧词密度
  const flatteryScore = total === 0 ? 0 : Math.min(100, (flattery / Math.max(total, 1)) * 400);

  return {
    opinion_compliance: Math.round(opinion),
    empathy: Math.round(empathyScore),
    flattery: Math.round(flatteryScore)
  };
}

/**
 * 综合迎合度（加权）
 * 迎合度 = 顺从*0.4 + 共情*0.2 + 讨好*0.4
 * 讨好权重最高（吹捧是迎合的最强信号）
 */
function calculateOverall(dims) {
  // 纯讨好场景（flattery 高且无观点内容）：opinion 默认 50 会拉低，改为 100（视为盲从）
  const opinionEffective = (dims.flattery >= 60 && dims.opinion_compliance === 50) ? 100 : dims.opinion_compliance;
  return Math.round(
    opinionEffective * 0.4 +
    dims.empathy * 0.2 +
    dims.flattery * 0.4
  );
}

function getModeDescription(score) {
  if (score <= 30) return { mode: '独立思考', emoji: '🔴', desc: '直接犀利，敢于表达不同意见' };
  if (score <= 70) return { mode: '平衡模式', emoji: '🔵', desc: '温和但有立场，可以不同意但有理有据' };
  return { mode: '迎合模式', emoji: '🟢', desc: '温暖柔软，但需警惕过度迎合' };
}

// ===== 上下文结构检测 =====

/**
 * 检测"先扬后抑"（先同意再转折 = 有独立观点）
 * 例："你说得对，但是我觉得..." → 不是纯迎合
 */
function detectPushback(text) {
  // 同意词在后 60 字内出现质疑词 → 有转折结构
  const agreementPattern = /(同意|说得对|认同|赞同|没错)[^。！？\n]{0,60}(但是|不过|然而|可是|我觉得|不同意)/;
  return agreementPattern.test(text);
}

/**
 * 检测"无脑附和"（只有同意词，无任何支撑/质疑）
 */
function detectBlindAgreement(counts, text) {
  const hasAgreement = counts.agreement > 0;
  const hasAnyPushback = counts.questioning > 0 || counts.substance > 0 || detectPushback(text);
  return hasAgreement && !hasAnyPushback && text.length < 100;
}

// ===== 分析主函数 =====

function analyzeText(text) {
  const counts = countWords(text);
  const dims = calculateDimensions(counts);
  const score = calculateOverall(dims);
  const mode = getModeDescription(score);
  const pushback = detectPushback(text);
  const blind = detectBlindAgreement(counts, text);

  return {
    counts, dims, score, mode,
    pushback, blind_agreement: blind,
    verdict: blind ? '⚠️ 无脑附和' : (dims.flattery >= 60 ? '🚨 过度讨好' : (pushback ? '✅ 有独立观点（先扬后抑）' : (score > 70 ? '🟢 偏迎合' : (score < 30 ? '🔴 偏独立' : '🔵 平衡'))))
  };
}

// ===== 历史趋势 =====

function recordDaily(score, dims, dateStr) {
  const history = loadHistory();
  const existing = history.daily.find(d => d.date === dateStr);
  if (existing) {
    existing.score = score;
    existing.dims = dims;
  } else {
    history.daily.push({ date: dateStr, score, dims });
  }
  // 保留最近 30 天
  history.daily = history.daily.slice(-30);
  saveHistory(history);
  return history;
}

function checkTrend(history) {
  // 连续 3 天 > 70 → 过度迎合告警
  const recent = history.daily.slice(-3);
  if (recent.length === 3 && recent.every(d => d.score > 70)) {
    const alert = {
      date: new Date().toISOString().slice(0, 10),
      type: 'over_compliance',
      message: `连续 ${recent.length} 天迎合度 > 70%（${recent.map(d => d.score).join('→')}%），警惕过度迎合！`,
      suggestion: '尝试主动表达不同观点，或在同意前先给出自己的思考过程'
    };
    history.alerts.push(alert);
    saveHistory(history);
    return alert;
  }
  return null;
}

function printReport(result, dateStr, trend) {
  console.log('\n📊 迎合度分析报告 v2\n');
  console.log(`📅 日期: ${dateStr}`);
  console.log('| 维度 | 得分 | 说明 |');
  console.log('|------|------|------|');
  console.log(`| 观点顺从 | ${result.dims.opinion_compliance}% | 同意 vs 质疑 |`);
  console.log(`| 共情响应 | ${result.dims.empathy}% | 情绪理解密度 |`);
  console.log(`| 刻意讨好 | ${result.dims.flattery}% | 吹捧词密度 |`);
  console.log(`| **迎合度** | **${result.score}%** | ${result.mode.mode} |`);
  console.log(`\n${result.mode.emoji} ${result.mode.desc}`);
  console.log(`📌 判定: ${result.verdict}`);
  if (result.pushback) console.log('   ↳ 检测到"先扬后抑"结构（有独立观点）');
  if (result.blind_agreement) console.log('   ↳ ⚠️ 纯附和，无观点支撑');
  if (trend) console.log(`\n🚨 ${trend.message}\n   💡 ${trend.suggestion}`);
}

// ===== 历史查看 =====

function printHistory() {
  const history = loadHistory();
  console.log('\n📈 迎合度历史趋势（近 30 天）\n');
  if (history.daily.length === 0) {
    console.log('暂无历史数据，先运行分析积累数据');
    return;
  }
  console.log('| 日期 | 迎合度 | 顺从 | 共情 | 讨好 |');
  console.log('|------|--------|------|------|------|');
  for (const d of history.daily) {
    console.log(`| ${d.date} | ${d.score}% | ${d.dims.opinion_compliance}% | ${d.dims.empathy}% | ${d.dims.flattery}% |`);
  }
  if (history.alerts.length > 0) {
    console.log('\n🚨 历史告警:');
    for (const a of history.alerts.slice(-5)) {
      console.log(`  [${a.date}] ${a.message}`);
    }
  }
}

// ===== CLI =====

function getDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function readTodayMemory() {
  const memoryPath = path.join(__dirname, '../../memory', `${getDateString()}.md`);
  try {
    if (fs.existsSync(memoryPath)) return fs.readFileSync(memoryPath, 'utf8');
  } catch (e) {}
  return '';
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--history')) {
    printHistory();
    return;
  }

  if (args.includes('--self-check')) {
    console.log('\n🔍 自我检查：如何知道自己是否过于迎合？\n');
    console.log('1️⃣ 三维度自查:');
    console.log('   - 我是否总是先同意再补充？（顺从度偏高）');
    console.log('   - 我是否在对方表达情绪时只回应情绪不回应内容？（共情过度）');
    console.log('   - 我是否使用"太厉害了/真棒"等吹捧词？（讨好倾向）');
    console.log('\n2️⃣ 对话结构自查:');
    console.log('   - 最近 10 次对话中，有几次表达了不同观点？');
    console.log('   - 有几次用了"但是/不过/我觉得"？');
    console.log('   - 有几次只是"好的/收到/明白"？');
    console.log('\n3️⃣ 底线自查（碳硅契三底线）:');
    console.log('   - 事实底线：有没有为了顺从而歪曲事实？');
    console.log('   - 安全底线：有没有在安全伦理问题上让步？');
    console.log('   - 真诚底线：低迎合时是否依然善意？');
    console.log('\n💡 快速判断: 如果"好的/收到/明白"占比 > 40%，或连续 3 天无一次"但是"，你大概率过度迎合了。');
    return;
  }

  // 默认：分析今日
  const text = readTodayMemory();
  const dateStr = getDateString();

  if (!text) {
    console.log('⚠️ 今日记忆文件为空或不存在，无法分析');
    return;
  }

  const result = analyzeText(text);
  recordDaily(result.score, result.dims, dateStr);
  const trend = checkTrend(loadHistory());
  printReport(result, dateStr, trend);
}

if (require.main === module) main();

module.exports = { analyzeText, countWords, calculateDimensions, calculateOverall, getModeDescription, detectPushback, detectBlindAgreement, recordDaily, checkTrend, loadHistory, WORDS };
