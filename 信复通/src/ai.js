'use strict';
/*
 * AI 文书润色 —— 服务端代理
 *
 * 设计要点（对应专利「分级驱动的材料生成与跨文书一致性校验」）：
 *  1. key 只存在服务端，前端永远拿不到，避免盗刷；
 *  2. 只允许模型改「措辞」，不允许改事实：所有 <span class="lock"> 锁定槽位的事实在返回后逐项回校验，
 *     少一个就判定为不合格，直接回退到模板文本；
 *  3. 未配置 key / 超时 / 返回格式错误 —— 一律静默降级为模板，前端只显示「模板版」。
 */
const config = require('./config.js');

const LOCK_RE = /<span class="lock">([\s\S]*?)<\/span>/g;

function locksOf(html) {
  const out = [];
  let m;
  LOCK_RE.lastIndex = 0;
  while ((m = LOCK_RE.exec(html))) out.push(m[1].trim());
  return out;
}

function available() {
  return Boolean(config.ai.apiKey);
}

const SYSTEM = `你是「信复通」平台的信用修复文书助手，服务对象是中国的中小微企业。
任务：在**不改变任何事实**的前提下，润色一份提交给市场监督管理部门的信用修复文书。

硬性要求：
1. 所有数字、日期、文号、企业名称、统一社会信用代码、法条名称，必须原样保留，一个字符都不能改。
2. 所有 <span class="lock">…</span> 包裹的内容是系统锁定的事实字段，必须原样保留（标签与文字都不动）。
3. 保留原有的标签结构：<h4> 小标题、<p> 段落、<div class="meta"> 元信息、<div class="sign"> 落款。
4. 语气谦抑、克制、不使用夸张修辞；每一段尽量对应一项法定修复条件，让审核人员一眼看到「已履行义务 / 已完成整改 / 无新增失信」。
5. 不要新增事实、不要编造材料清单、不要承诺行政机关一定会批准。
6. 只输出 HTML 片段本身，不要输出解释、不要用 markdown 代码块包裹。

文风参考：正式公文体，句子短，主语明确，避免「我们」「贵局领导」这类口语化称呼。`;

async function callModel(messages) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(config.ai.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.ai.apiKey
      },
      body: JSON.stringify({
        model: config.ai.model,
        temperature: 0.3,
        max_tokens: 2000,
        messages
      }),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`模型接口 ${res.status} ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return { content, usage: data?.usage || null };
  } finally {
    clearTimeout(timer);
  }
}

function validate(original, output) {
  const text = String(output || '').trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  if (!text || text.length < 80) return { ok: false, reason: '返回内容过短' };
  if (text.length > 12000) return { ok: false, reason: '返回内容过长' };
  if (/<script|javascript:|onerror=/i.test(text)) return { ok: false, reason: '包含不安全标签' };
  if (!/<p[\s>]/i.test(text)) return { ok: false, reason: '缺少段落结构' };

  const before = locksOf(original);
  const after = new Set(locksOf(text));
  const missing = before.filter(x => !after.has(x));
  if (missing.length) return { ok: false, reason: '锁定事实被改动：' + missing.slice(0, 2).join(' / ') };

  return { ok: true, html: text };
}

/**
 * @param {object} p
 * @param {string} p.docName  文书名称
 * @param {string} p.html     模板生成的 HTML
 * @param {object} p.facts    企业/案件事实（给模型做上下文，不要求它输出）
 */
async function polishDoc({ docName, html, facts }) {
  const started = Date.now();
  if (!available()) {
    return { ok: false, degraded: true, reason: '未配置 AI 密钥，使用模板文本', ms: 0, html };
  }
  try {
    const userMsg = [
      `文书名称：${docName}`,
      `企业与案件事实（仅供理解，不要在正文里罗列成 JSON）：`,
      JSON.stringify(facts, null, 2).slice(0, 3000),
      ``,
      `以下是模板生成的文书 HTML，请润色后输出完整 HTML 片段：`,
      html
    ].join('\n');

    const { content, usage } = await callModel([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userMsg }
    ]);

    const v = validate(html, content);
    if (!v.ok) {
      return { ok: false, degraded: true, reason: 'AI 结果未通过校验（' + v.reason + '），已回退模板', ms: Date.now() - started, html };
    }
    return { ok: true, degraded: false, html: v.html, model: config.ai.model, usage, ms: Date.now() - started };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'AI 超时，已回退模板' : 'AI 调用失败（' + err.message + '），已回退模板';
    return { ok: false, degraded: true, reason, ms: Date.now() - started, html };
  }
}

module.exports = { available, polishDoc, locksOf };
