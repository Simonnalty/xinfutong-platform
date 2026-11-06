'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateRegion } = require('../src/services/regions');
test('地区必须为同省的省市组合，直辖市单独有效', () => {
  assert.equal(validateRegion('湖南省长沙市'), '湖南省长沙市');
  assert.equal(validateRegion('北京市'), '北京市');
  assert.throws(() => validateRegion('湖南省北京市'), /省市/);
  assert.throws(() => validateRegion('湖南省广州市'), /省市/);
});
