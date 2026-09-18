/**
 * An isometric floor tile as pixel art: a 2:1 diamond with a stepped edge,
 * two pixels across per pixel down, drawn as an SVG pattern so it tiles.
 * Colours are literal because a data URI cannot read CSS variables.
 */
export function pixelFloorDataUri(fill: string, line: string, px = 2): string {
  const w = 32 * px;
  const h = 16 * px;
  // Staircase outline of the diamond, clockwise from the top.
  const steps: string[] = [];
  const half = h / 2;
  for (let y = 0; y < half; y += px) {
    const x = (y / px + 1) * 2 * px;
    steps.push(`${w / 2 + x - 2 * px},${y} ${w / 2 + x},${y}`);
  }
  const right = steps.flatMap((s) => s.split(" "));
  const path = [
    `M${w / 2 - px},0`,
    ...right.map((p) => `L${p}`),
    `L${w},${half}`,
    `L${w / 2},${h}`,
    `L0,${half}`,
    "Z",
  ].join(" ");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' shape-rendering='crispEdges'>` +
    `<rect width='${w}' height='${h}' fill='${line}'/>` +
    `<path d='${path}' fill='${fill}'/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
