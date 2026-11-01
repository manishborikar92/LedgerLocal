import type { ParseOptions, ParseOutput } from '@/core/parse';

export type WorkerRequest =
  | { type: 'parse'; id: number; bytes: ArrayBuffer; fileName: string; password?: string; options?: ParseOptions }
  | { type: 'reparse'; id: number; sha256: string; options: ParseOptions };

export type ErrorCode = 'password-needed' | 'password-incorrect' | 'corrupt' | 'no-text-layer' | 'no-transactions' | 'cache-miss' | 'unknown';
export type WorkerResponse =
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'result'; id: number; sha256: string; pageCount: number; output: ParseOutput }
  | { type: 'error'; id: number; code: ErrorCode; message: string };
