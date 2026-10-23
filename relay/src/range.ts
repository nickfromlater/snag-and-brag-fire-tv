/** A single byte range. Ignore unsupported units/multipart; false means 416. */
export function byteRange(header: string | undefined, length: number): { start: number; end: number } | false | undefined {
  if (!header || !header.startsWith('bytes=') || header.includes(',')) return;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || !(match[1] || match[2])) return false;
  const first = match[1] ? Number(match[1]) : undefined, last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) return false;
  const start = first ?? Math.max(0, length - (last ?? 0));
  const end = first === undefined ? length - 1 : Math.min(last ?? length - 1, length - 1);
  if (start >= length || start > end) return false;
  return { start, end };
}
