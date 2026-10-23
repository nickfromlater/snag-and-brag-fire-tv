import { expect, it } from 'vitest';
import { asciiJson } from '../src/runtime/relay';

it('escapes every non-ASCII character and round-trips through JSON.parse', () => {
  const value = { t: 'screen', msg: 'The Pixel Judge is scanning…', name: 'Señor Sock 🧦' };
  const text = asciiJson(value);
  expect(/^[\x00-\x7f]*$/.test(text)).toBe(true);
  expect(JSON.parse(text)).toEqual(value);
});
