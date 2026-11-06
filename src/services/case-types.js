'use strict';
/*
 * 事项类型注册表：类型 → 中文名、支持等级、受理机关、官方入口、参考材料。
 *
 * 支持等级决定平台能不能自动判定：
 *   L1 完整支持 —— 录入经复核的规则后，可自动判定可申请日与前置条件
 *   L2 指引支持 —— 只给材料清单与办理入口，不输出任何结论
 *   L3 仅导航   —— 只给官方入口；该类是否属于信用修复路径本身需另行确认
 *
 * 原则：没有把握的类型宁可不判断。给出错误的「可申请日」比说「暂不判断」危害大得多。
 */

const SUPPORT = {
  L1: '完整支持',
  L2: '指引支持',
  L3: '仅导航'
};

const TYPES = {
  penalty: {
    code: 'penalty',
    label: '行政处罚信息',
    short: '行政处罚',
    level: 'L1',
    desc: '行政机关作出的行政处罚决定信息，在信用平台公示后的修复申请。',
    authority: '作出行政处罚决定的行政机关',
    channel: { name: '信用中国', url: 'https://www.creditchina.gov.cn/' },
    materials: ['apply', 'promise', 'rectify', 'auth', 'list'],
    note: ''
  },
  abnormal: {
    code: 'abnormal',
    label: '经营异常名录',
    short: '经营异常',
    level: 'L1',
    desc: '因未按期公示年报、住所失联等被列入经营异常名录后的移出登记。',
    authority: '作出列入决定的登记机关（市场监督管理部门）',
    channel: { name: '国家企业信用信息公示系统', url: 'https://www.gsxt.gov.cn/' },
    materials: ['apply', 'promise', 'rectify', 'auth', 'list'],
    note: ''
  },
  blacklist: {
    code: 'blacklist',
    label: '严重失信主体名单',
    short: '严重失信名单',
    level: 'L2',
    desc: '被列入严重失信主体名单后的修复。各领域认定标准与修复条件差异较大，尚未完成法律核验。',
    authority: '认定该名单的行政机关',
    channel: { name: '信用中国', url: 'https://www.creditchina.gov.cn/' },
    materials: ['apply', 'promise', 'rectify', 'auth', 'list', 'plan'],
    note: '该类情形的修复条件尚未完成法律核验，平台仅提供材料参考清单与官方办理入口，不判断可申请时间。'
  },
  tax: {
    code: 'tax',
    label: '重大税收违法失信',
    short: '税收违法',
    level: 'L2',
    desc: '税务机关公布的重大税收违法失信主体信息的修复。',
    authority: '作出认定的税务机关',
    channel: { name: '国家税务总局', url: 'https://www.chinatax.gov.cn/' },
    materials: ['apply', 'promise', 'rectify', 'auth', 'list', 'plan'],
    note: '该类情形的修复条件尚未完成法律核验，平台仅提供材料参考清单与官方办理入口，不判断可申请时间。'
  },
  customs: {
    code: 'customs',
    label: '海关失信企业',
    short: '海关失信',
    level: 'L2',
    desc: '被海关认定为失信企业的信用等级调整申请。',
    authority: '认定信用等级的海关',
    channel: { name: '海关总署', url: 'http://www.customs.gov.cn/' },
    materials: ['apply', 'promise', 'rectify', 'auth', 'list', 'plan'],
    note: '该类情形的修复条件尚未完成法律核验，平台仅提供材料参考清单与官方办理入口，不判断可申请时间。'
  },
  court: {
    code: 'court',
    label: '法院失信被执行人',
    short: '执行失信',
    level: 'L3',
    desc: '人民法院公布的失信被执行人名单。该名单的解除由法院依职权或依申请删除，不属于行政机关信用修复路径。',
    authority: '作出纳入决定的人民法院',
    channel: { name: '中国执行信息公开网', url: 'http://zxgk.court.gov.cn/' },
    materials: [],
    note: '该类情形不属于行政机关信用修复路径，解除需由法院删除失信信息。平台仅提供官方查询入口，不提供办理协助。'
  }
};

const ORDER = ['penalty', 'abnormal', 'blacklist', 'tax', 'customs', 'court'];

function get(code) {
  return TYPES[code] || null;
}

function exists(code) {
  return Boolean(TYPES[code]);
}

/** 只有 L1 类型才允许自动判定；其余类型一律走「待复核」 */
function isAutoJudgeable(code) {
  return TYPES[code]?.level === 'L1';
}

function supportLabel(code) {
  return SUPPORT[TYPES[code]?.level] || '未知';
}

/** 给前端用的完整清单（不含内部备注之外的敏感信息） */
function list() {
  return ORDER.map(code => {
    const t = TYPES[code];
    return {
      code: t.code,
      label: t.label,
      short: t.short,
      support: t.level,
      supportLabel: SUPPORT[t.level],
      desc: t.desc,
      authority: t.authority,
      channel: t.channel,
      materials: t.materials,
      autoJudgeable: t.level === 'L1',
      note: t.note
    };
  });
}

module.exports = { TYPES, SUPPORT, ORDER, get, exists, isAutoJudgeable, supportLabel, list };
