export type ParseErrorCode = 'password-needed' | 'password-incorrect' | 'corrupt' | 'no-text-layer' | 'no-transactions' | 'cache-miss' | 'unknown' | 'cancelled' | 'unsupported-browser';
/** Error raised by any parse adapter; the UI switches on `code`. */
export class ParseFailure extends Error {
  constructor(public code: ParseErrorCode, message: string) {
    super(message);
    this.name = 'ParseFailure';
  }
}
