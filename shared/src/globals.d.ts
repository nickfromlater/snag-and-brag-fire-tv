// Shared code runs in browsers, Node and React Native (Hermes), so it gets no DOM lib.
// TextEncoder/TextDecoder may be missing on older Hermes; protocol.ts checks before use.
declare class TextEncoder { encode(s?: string): Uint8Array }
declare class TextDecoder { decode(b?: Uint8Array): string }
