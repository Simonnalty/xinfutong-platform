'use strict';
const regions = require('../../db/regions-province-city.json');
const valid = new Set(regions.flatMap(({ province, cities }) => cities.length ? cities.map(city => province + city) : [province]));
function validateRegion(value) {
  const region = String(value || '').trim();
  if (region && !valid.has(region)) throw new Error('请选择正确的省市组合');
  return region;
}
module.exports = { validateRegion };
