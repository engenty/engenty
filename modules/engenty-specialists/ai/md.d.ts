// SKILL.md and instruction assets are imported as strings (tsup and vitest
// both load `.md` as text). Same declaration `@engenty/ai-core` ships.
declare module "*.md" {
  const content: string;
  export default content;
}
