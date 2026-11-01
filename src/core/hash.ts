import { sha256 } from '@noble/hashes/sha2.js';

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
export function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += HEX[x];
  return s;
}
export const sha256Hex = (data: Uint8Array | string): string => toHex(sha256(typeof data === 'string' ? new TextEncoder().encode(data) : data));
