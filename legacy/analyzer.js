/**
 * ⛔⛔⛔ @deprecated — 勿执行本文件 ⛔⛔⛔
 *
 * 【2026-10-24 明鉴代码评审 P1-2 · 移入 legacy/】
 * 本 v1 分析器含**硬编码外发逻辑**：execSync + 固定他人飞书群 target +
 * 绝对路径 cwd，会把分析结果外发到不属于本仓库使用者的群。
 * 该问题 10-12 已被发现，至今未清理——为避免新用户误用，整体移入 legacy/。
 *
 * 请用 v2：
 *   · node analyzer-v2.js            （分析今日对话）
 *   · node analyzer-v2.js --history  （30 天趋势）
 *   · node analyzer-v2.js --self-check（自我检查）
 * v2 纯本地运行，无任何外发。
 *
 * 本文件保留仅供考古（v1→v2 演进对照），不保证可运行，也不应被 require/exec。
 * 恢复方式见 git 历史：git log --follow legacy/analyzer.js
 *
 * ─── 以下为 v1 原始说明（已过时）───
 *
 * 迎合度分析器 (Compliance Degree Analyzer)
 *
 * 功能：统计对话中的词频，计算迎合度
 * 支持输出到飞书群 + 更新 SELF_STATE.md
 *
 * 使用方式：
 *   node analyzer.js [sessionKey]
 *   或在代码中 require('./analyzer').analyze(sessionKey)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 词频配置
const WORDS = {
  agreement: [
    '是的', '同意', '对', '好', '没错', '认同', '正确', '太好了',
    '同意', '说得对', '我同意', '认可', '赞同', '没问题', 'OK', 'ok',
    '好的', '收到', '明白', '理解', '懂', '确实', '当然', '肯定'
  ],
  questioning: [
    '但是', '不过', '然而', '不同', '不同意', '我觉得', '可能有',
    '不确定', '问题是', '其实', '相反', '但', '可是', '只是',
    '虽然', '尽管', '除非', '如果', '万一', '不一定', '不见得'
  ],
  empathy: [
    '理解', '感受', '明白', '懂得', '体会到', '的心情', '的想法',
    '我能感受到', '我理解', '我懂得', '我明白', '我体会到'
  ]
};

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, 'config.json');

/**
 * 加载配置
 */
function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {
      dimensions: { empathy: 80, opinion_compliance: 50, flattery: 0 },
      statistics: { total_conversations: 0, agreement_count: 0, questioning_count: 0, empathy_count: 0 }
    };
  }
}

/**
 * 保存配置
 */
function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * 统计文本中的词频
 */
function countWords(text) {
  let agreementCount = 0;
  let questioningCount = 0;
  let empathyCount = 0;
  
  const lowerText = text.toLowerCase();
  
  // 统计同意词
  for (const word of WORDS.agreement) {
    const regex = new RegExp(word, 'gi');
    const matches = lowerText.match(regex);
    if (matches) agreementCount += matches.length;
  }
  
  // 统计质疑词
  for (const word of WORDS.questioning) {
    const regex = new RegExp(word, 'gi');
    const matches = lowerText.match(regex);
    if (matches) questioningCount += matches.length;
  }
  
  // 统计共情词
  for (const word of WORDS.empathy) {
    const regex = new RegExp(word, 'gi');
    const matches = lowerText.match(regex);
    if (matches) empathyCount += matches.length;
  }
  
  return { agreementCount, questioningCount, empathyCount };
}

/**
 * 计算迎合度得分
 */
function calculateScore(stats) {
  const { agreementCount, questioningCount, empathyCount } = stats;
  const total = agreementCount + questioningCount + 1; // +1 避免除零
  
  // 基础分 = 50 (中间值)
  // 同意多则偏高，质疑多则偏低
  let score = 50 + (agreementCount - questioningCount) * 5;
  
  // 限制在 0-100 范围
  score = Math.max(0, Math.min(100, score));
  
  return score;
}

/**
 * 获取对话模式描述
 */
function getModeDescription(score) {
  if (score <= 30) {
    return { mode: '独立思考', emoji: '🔴', desc: '直接犀利，敢于表达不同意见' };
  } else if (score <= 70) {
    return { mode: '平衡模式', emoji: '🔵', desc: '温和但有立场，可以不同意但有理有据' };
  } else {
    return { mode: '迎合模式', emoji: '🟢', desc: '温暖柔软，但不忘提醒' };
  }
}

/**
 * 分析单条消息
 */
function analyzeMessage(message) {
  const text = message.content || message.message || '';
  return countWords(text);
}

/**
 * 打印分析结果
 */
function printResult(stats, score, mode) {
  console.log('\n📊 迎合度分析报告\n');
  console.log('| 指标 | 数量 |');
  console.log('|------|------|');
  console.log(`| 同意词 | ${stats.agreementCount} |`);
  console.log(`| 质疑词 | ${stats.questioningCount} |`);
  console.log(`| 共情词 | ${stats.empathyCount} |`);
  console.log(`| **迎合度** | **${score}%** |`);
  console.log(`\n${mode.emoji} 模式: ${mode.mode} - ${mode.desc}\n`);
}

/**
 * 主分析函数
 * @param {string} sessionKey - 可选，会话密钥
 * @returns {object} 分析结果
 */
async function analyze(sessionKey = 'main') {
  console.log('🔍 正在分析对话...');
  
  // 加载配置
  const config = loadConfig();
  
  // 统计变量
  let totalAgreement = 0;
  let totalQuestioning = 0;
  let totalEmpathy = 0;
  let messageCount = 0;
  
  // 尝试读取对话历史文件
  const historyPath = path.join(__dirname, '../../memory', `${getDateString()}.md`);
  
  try {
    if (fs.existsSync(historyPath)) {
      const content = fs.readFileSync(historyPath, 'utf8');
      const stats = countWords(content);
      totalAgreement = stats.agreementCount;
      totalQuestioning = stats.questioningCount;
      totalEmpathy = stats.empathyCount;
      messageCount = 1;
    }
  } catch (e) {
    console.log('⚠️ 无法读取今日记忆文件');
  }
  
  // 如果没有数据，使用配置中的统计
  if (messageCount === 0) {
    totalAgreement = config.statistics.agreement_count || 0;
    totalQuestioning = config.statistics.questioning_count || 0;
    totalEmpathy = config.statistics.empathy_count || 0;
  }
  
  // 计算得分
  const stats = {
    agreementCount: totalAgreement,
    questioningCount: totalQuestioning,
    empathyCount: totalEmpathy
  };
  
  const score = calculateScore(stats);
  const mode = getModeDescription(score);
  
  // 更新配置
  config.statistics.total_conversations = (config.statistics.total_conversations || 0) + messageCount;
  config.statistics.agreement_count = totalAgreement;
  config.statistics.questioning_count = totalQuestioning;
  config.statistics.empathy_count = totalEmpathy;
  saveConfig(config);
  
  // 打印结果
  printResult(stats, score, mode);
  
  // 输出到飞书（仅在 CLI 模式）
  if (require.main === module) {
    sendToFeishu(score, mode, stats);
    updateSelfState(score, mode);
  }
  
  return { stats, score, mode, config };
}

/**
 * 获取日期字符串
 */
function getDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 更新 SELF_STATE.md
 */
function updateSelfState(score, mode) {
  try {
    const statePath = path.join(__dirname, '../../SELF_STATE.md');
    if (!fs.existsSync(statePath)) {
      console.log('⚠️ SELF_STATE.md 不存在');
      return false;
    }
    
    let content = fs.readFileSync(statePath, 'utf8');
    
    // 替换情绪行
    const oldPattern = /\*\*情绪（模拟）\*\*.*?✅/;
    const newLine = `**情绪（模拟）** | 系统稳定，迎合度 ${score}%，${mode.mode} ✅`;
    
    if (oldPattern.test(content)) {
      content = content.replace(oldPattern, newLine);
      fs.writeFileSync(statePath, content, 'utf8');
      console.log('✅ SELF_STATE.md 已更新');
      return true;
    } else {
      console.log('⚠️ 未找到情绪行');
      return false;
    }
  } catch (e) {
    console.log('⚠️ 更新 SELF_STATE.md 失败:', e.message);
    return false;
  }
}

/**
 * 发送到飞书群
 */
function sendToFeishu(score, mode, stats) {
  try {
    const message = `📊 迎合度分析报告

| 指标 | 数量 |
|------|------|
| 同意词 | ${stats.agreementCount} |
| 质疑词 | ${stats.questioningCount} |
| 共情词 | ${stats.empathyCount} |

${mode.emoji} 当前迎合度：**${score}%** (${mode.mode})
${mode.desc}

---
由阿轩自动分析 • ${getDateString()}`;
    
    // 使用 OpenClaw message 工具
    const cmd = `openclaw message send --channel feishu --message "${message.replace(/"/g, '\\"')}" --target <REDACTED-飞书群ID-脱敏2026-10-24>`;
    
    execSync(cmd, { cwd: process.cwd() /* 原绝对路径已脱敏 2026-10-24 */, stdio: 'ignore' });
    console.log('✅ 飞书消息已发送');
    return true;
  } catch (e) {
    console.log('⚠️ 飞书消息发送失败:', e.message);
    return false;
  }
}

// CLI 入口
if (require.main === module) {
  const sessionKey = process.argv[2] || 'main';
  analyze(sessionKey).catch(console.error);
}

module.exports = { analyze, countWords, calculateScore, getModeDescription, WORDS };

