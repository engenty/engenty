export interface ApiLogger {
  debug: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
}
