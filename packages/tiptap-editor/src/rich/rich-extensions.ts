/**
 * Rich editor TipTap extensions (tables, media, callouts, slash menu, etc.).
 */

import type { Extensions } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table";
import { common, createLowlight } from "lowlight";
import { getBaseExtensions } from "../base/index.jsx";
import { CalloutExtension } from "../extensions/callout.js";
import { RawHtmlExtension } from "../extensions/raw-html.js";
import {
  defaultSlashCommands,
  type SlashCommandItem,
  SlashCommands,
} from "../extensions/slash-commands.js";
import { createSlashSuggestionRenderer } from "./slash-command-renderer.jsx";

const lowlight = createLowlight(common);

export function getRichContentExtensions(opts?: {
  placeholder?: string;
}): Extensions {
  return [
    ...getBaseExtensions(opts),
    Highlight.configure({ multicolor: true }),
    Image.configure({
      inline: true,
      allowBase64: true,
      HTMLAttributes: { class: "tiptap-image" },
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlockLowlight.configure({ lowlight }),
    CalloutExtension,
    RawHtmlExtension,
  ];
}

export function getRichExtensions(opts?: {
  placeholder?: string;
  slashCommands?: SlashCommandItem[] | false;
}): Extensions {
  const extensions: Extensions = [...getRichContentExtensions(opts)];

  if (opts?.slashCommands !== false) {
    const commands = Array.isArray(opts?.slashCommands)
      ? opts.slashCommands
      : defaultSlashCommands;

    extensions.push(
      SlashCommands.configure({
        commands,
        suggestion: {
          render: createSlashSuggestionRenderer(),
        },
      })
    );
  }

  return extensions;
}
