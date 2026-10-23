import { expect, it } from 'vitest';
import { foregroundUpdate } from '../src/runtime/foreground';

it('normalizes app and module foreground/background notifications', () => {
  expect(foregroundUpdate('active')).toBe(true);
  expect(foregroundUpdate('background')).toBe(false);
  expect(foregroundUpdate([{ module_name: 'com.snagbrag.tv.main', module_state: 'BACKGROUND' }])).toBe(false);
  expect(foregroundUpdate([{ module_state: 'inactive' }, { module_state: 'active' }])).toBe(true);
  expect(foregroundUpdate({ module_state: 'not_visible' })).toBe(false);
});

it('ignores unknown/empty lifecycle data instead of hiding the app', () => {
  for (const value of [undefined, null, [], {}, 'unknown', { reconfigure_reason: 'homePressed' }]) expect(foregroundUpdate(value)).toBeUndefined();
});
