// react-syntax-highlighter ships no types for its deep ESM subpaths (and no
// @types package is installed). Referenced via triple-slash from
// skill-file-code-view.tsx so the declarations travel with the source for
// consumers that type-check it directly (types -> src).
declare module "react-syntax-highlighter" {
  import type { ComponentType, ReactNode } from "react";
  // Untyped upstream — keep the surface open (the library forwards arbitrary
  // props like codeTagProps/PreTag/showLineNumbers to its renderer).
  export const PrismLight: ComponentType<{
    children?: ReactNode;
    [prop: string]: unknown;
  }> & {
    registerLanguage: (name: string, language: unknown) => void;
  };
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/json";
declare module "react-syntax-highlighter/dist/esm/languages/prism/markdown";
declare module "react-syntax-highlighter/dist/esm/languages/prism/typescript";
declare module "react-syntax-highlighter/dist/esm/languages/prism/yaml";
declare module "react-syntax-highlighter/dist/esm/styles/prism" {
  export const oneDark: Record<string, unknown>;
  export const oneLight: Record<string, unknown>;
}
