import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAdministrativePlace } from '../src/lib/googleMaps.ts';

test('reverse geocoding displays a city, province, and country without a street address', () => {
  const result = formatAdministrativePlace([{ address_components: [
    { long_name: '洪山区', types: ['sublocality_level_1'] },
    { long_name: '武汉市', types: ['locality', 'political'] },
    { long_name: '湖北省', types: ['administrative_area_level_1', 'political'] },
    { long_name: '中国', types: ['country', 'political'] },
  ] }]);

  assert.equal(result, '武汉市，湖北省，中国');
});

test('reverse geocoding uses a county when no city is available and avoids duplicate municipalities', () => {
  assert.equal(formatAdministrativePlace([{ address_components: [
    { long_name: '晋江市', types: ['administrative_area_level_3', 'political'] },
    { long_name: '福建省', types: ['administrative_area_level_1', 'political'] },
    { long_name: '中国', types: ['country', 'political'] },
  ] }]), '晋江市，福建省，中国');
  assert.equal(formatAdministrativePlace([{ address_components: [
    { long_name: '北京市', types: ['locality', 'political'] },
    { long_name: '北京市', types: ['administrative_area_level_1', 'political'] },
    { long_name: '中国', types: ['country', 'political'] },
  ] }]), '北京市，中国');
});

test('reverse geocoding does not invent a place when no administrative result exists', () => {
  assert.equal(formatAdministrativePlace([]), null);
  assert.equal(formatAdministrativePlace([{ address_components: [] }]), null);
});
