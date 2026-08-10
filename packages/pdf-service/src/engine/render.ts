import {
  Document,
  Image,
  Link,
  Page,
  type StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import React from "react";
import type { NodeAST } from "../types";

function normalizeStyleNames(input?: string | string[]): string[] {
  if (!input) {
    return [];
  }
  return Array.isArray(input) ? input : [input];
}

type ResolvedStyle = ReturnType<typeof StyleSheet.create>[string];

function resolveStyle(
  names: string | string[] | undefined,
  styles: ReturnType<typeof StyleSheet.create>
): ResolvedStyle | ResolvedStyle[] | undefined {
  const keys = normalizeStyleNames(names);
  if (!keys.length) {
    return;
  }
  const resolved = keys.map((key) => styles[key]).filter(Boolean);
  if (!resolved.length) {
    return;
  }
  return resolved.length === 1 ? resolved[0] : resolved;
}

function renderNode(
  node: NodeAST,
  styles: ReturnType<typeof StyleSheet.create>
): React.ReactElement {
  switch (node.type) {
    case "Document":
      return React.createElement(
        Document,
        null,
        ...node.children.map((child, idx) =>
          React.createElement(
            React.Fragment,
            { key: idx },
            renderNode(child, styles)
          )
        )
      );
    case "Page":
      return React.createElement(
        Page,
        {
          size: (node.size || "A4") as "A4",
          style: resolveStyle(node.style, styles),
        },
        ...node.children.map((child, idx) =>
          React.createElement(
            React.Fragment,
            { key: idx },
            renderNode(child, styles)
          )
        )
      );
    case "View":
      return React.createElement(
        View,
        {
          ...(node.break ? { break: true } : {}),
          style: resolveStyle(node.style, styles),
        },
        ...node.children.map((child, idx) =>
          React.createElement(
            React.Fragment,
            { key: idx },
            renderNode(child, styles)
          )
        )
      );
    case "Text":
      return React.createElement(
        Text,
        { style: resolveStyle(node.style, styles) },
        node.text ?? ""
      );
    case "Image":
      return React.createElement(Image, {
        src: node.src,
        style: resolveStyle(node.style, styles),
      });
    case "Link":
      return React.createElement(
        Link,
        {
          src: node.href,
          style: resolveStyle(node.style, styles),
        },
        node.text ?? node.href ?? ""
      );
    default:
      return React.createElement(View, null);
  }
}

export function renderAst(
  ast: NodeAST,
  styles: ReturnType<typeof StyleSheet.create>
): React.ReactElement {
  return renderNode(ast, styles);
}
