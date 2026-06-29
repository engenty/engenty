/** Tiny ANSI styling helper — TTY-aware, honors NO_COLOR. */

const colorEnabled =
  process.stdout.isTTY === true &&
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== "dumb";

function style(code: string): (text: string) => string {
  return (text) => (colorEnabled ? `\x1b[${code}m${text}\x1b[0m` : text);
}

export const bold = style("1");
export const dim = style("2");
export const red = style("31");
export const green = style("32");
export const yellow = style("33");
export const cyan = style("36");
export const underline = style("4");
