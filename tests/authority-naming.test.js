'use strict';
// 机关名称生成规则的纯函数用例（不依赖数据库）：node --test tests/authority-naming.test.js
const test = require('node:test');
const assert = require('node:assert');
const { buildName, TYPES } = require('../src/services/authorities');

const byLocal = (local, withTpl) => TYPES.find(e => e[0] === local && !!e[2] === !!withTpl);

test('区级机关按官方命名：卫健局、市局分局、税务冠市名', () => {
  const district = '雨湖区';
  const parent = '湘潭市';
  assert.equal(buildName(district, byLocal('卫生健康委员会'), 3, parent), '雨湖区卫生健康局');
  assert.equal(buildName(district, byLocal('生态环境局'), 3, parent), '湘潭市生态环境局雨湖分局');
  assert.equal(buildName(district, byLocal('公安局'), 3, parent), '湘潭市公安局雨湖分局');
  assert.equal(buildName(district, byLocal('税务局', true), 3, parent), '国家税务总局湘潭市雨湖区税务局');
  // 区级非派出机构保留区名，符合区政府门户写法（雨湖区市场监督管理局）
  assert.equal(buildName(district, byLocal('市场监督管理局'), 3, parent), '雨湖区市场监督管理局');
});

test('县级市去掉尾字，县保留县字', () => {
  assert.equal(buildName('湘乡市', byLocal('生态环境局'), 3, '湘潭市'), '湘潭市生态环境局湘乡分局');
  assert.equal(buildName('韶山市', byLocal('生态环境局'), 3, '湘潭市'), '湘潭市生态环境局韶山分局');
  assert.equal(buildName('湘潭县', byLocal('生态环境局'), 3, '湘潭市'), '湘潭市生态环境局湘潭县分局');
  // 县与县级市的税务局不冠市名
  assert.equal(buildName('湘潭县', byLocal('税务局', true), 3, '湘潭市'), '国家税务总局湘潭县税务局');
  assert.equal(buildName('湘乡市', byLocal('税务局', true), 3, '湘潭市'), '国家税务总局湘乡市税务局');
});

test('管理区等非标准区划不重复冠市名', () => {
  assert.equal(buildName('永州市回龙圩管理区', byLocal('生态环境局'), 3, '永州市'), '永州市回龙圩管理区生态环境局');
  assert.equal(buildName('永州市回龙圩管理区', byLocal('税务局', true), 3, '永州市'), '国家税务总局永州市回龙圩管理区税务局');
});

test('市级机关名称不变，教育与体育合并的市州用官方名', () => {
  assert.equal(buildName('湘潭市', byLocal('生态环境局'), 2, '湖南省'), '湘潭市生态环境局');
  assert.equal(buildName('岳阳市', byLocal('教育局'), 2, '湖南省'), '岳阳市教育体育局');
  assert.equal(buildName('湘西土家族苗族自治州', byLocal('教育局'), 2, '湖南省'), '湘西土家族苗族自治州教育和体育局');
  assert.equal(buildName('衡阳市', byLocal('教育局'), 2, '湖南省'), '衡阳市教育局');
});
