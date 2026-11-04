# CHANGELOG · csb-compliance-degree

> 补录说明（2026-11-04）：本仓此前**没有 CHANGELOG**。本文件由 git log 倒推补录，只写可追溯事实。
> 版本载体：`VERSION` / `package.json` / `config.json` / 本文件四处必须咬合（本仓多一个载体，见 `ddb6c60`）。

---

## v2.1.0（2026-10-24 基线 + 2026-11-02 增量）

**版本统一**：`ddb6c60`（2026-10-24）—— `VERSION` / `package.json` / `config.json` 三处对齐到 `2.1.0`。

| 日期 | 提交 | 内容 |
|---|---|---|
| 2026-10-21 | `40b5fae` | **v2.1 纠错保留率** —— 从对话文本扩到**行为轨迹**（Harness² P1）· `correction-retention.js` + 11 例测试 · 盲区声明强制非空（`known_fp` × 3 + `known_misses` × 4，接 RFC v2.1 P-12 精神） |
| 2026-10-22 | `b572357` | **v3 分析器** —— 从「数词猜语义」改成「数可复算的行为证据」· `analyzer-v3.js` + 15 例测试（含 v1/v2 假阳性的回归） |
| 2026-10-22 | `d098dd5` | fix(BID)：接入路径解析 + `gatedTest` 参数形态，修掉静默 `UNAVAILABLE` |
| 2026-10-24 | `7d4f44a` | **fix(security)**：v1 `analyzer.js` 移入 `legacy/` 并脱敏（明鉴评审 P1-2 · 10-12 发现，10-24 清理） |
| 2026-11-02 | `6ebe3c7` | **P1-4**：`config.json` 加判据指纹（`config_version` + `config_hash`） |

> ⚠️ **安全说明（沿用 README 顶部警示）**：v1 `analyzer.js` 含硬编码外发逻辑（`execSync` 发送他人飞书群），已移入 `legacy/` 并脱敏。**只用 v2 / v3**（纯本地无外发）。

---

## v2.0.0（2026-10-04）

**提交**：`2598082` — 新增 `VERSION` + `package.json` = `2.0.0`；`config.json` 1.0.0 → 2.0.0（对齐 analyzer / README）。
本仓此前无版本载体。

前身内容见 `5a28ced`（2026-08-28）：**v2 分析器** —— 三维度独立计分 + 礼貌词区分 + 上下文检测 + 趋势告警 + self-check。

---

## v1（2026-08-27 初始导入）

**提交**：`fddd217` — 初始导入：compliance-degree 迎合度库（来自 `csb-skills` 合集）。

> v1 分析器已于 2026-10-24 因外发安全问题移入 `legacy/`，不再作为可用实现。

---

_补录：若兰 🌸 · 2026-11-04 · 依据：git log 逐条 `git show -s` 核对，未做推测性补写_