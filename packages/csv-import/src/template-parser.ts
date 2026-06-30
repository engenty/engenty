interface TemplateModifiers {
  fallback?: string;
  postfix?: string;
  prefix?: string;
}

interface ParsedPlaceholder {
  columnRef: string;
  fullMatch: string;
  isIndex: boolean;
  modifiers: TemplateModifiers;
}

function parsePlaceholder(placeholder: string): ParsedPlaceholder {
  const modifiers: TemplateModifiers = {};
  const content = placeholder.slice(2, -2);

  const indexMatch = content.match(/^\[(\d+)\](.*)$/);
  const nameMatch = content.match(/^"([^"]+)"(.*)$/);

  let columnRef = "";
  let isIndex = false;
  let modifiersStr = "";

  if (indexMatch) {
    columnRef = indexMatch[1];
    isIndex = true;
    modifiersStr = indexMatch[2];
  } else if (nameMatch) {
    columnRef = nameMatch[1];
    isIndex = false;
    modifiersStr = nameMatch[2];
  } else {
    throw new Error(`Invalid placeholder format: ${placeholder}`);
  }

  const modifierRegex = /(prefix|postfix|fallback)="([^"]*)"/g;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = modifierRegex.exec(modifiersStr);
    if (!match) {
      break;
    }
    modifiers[match[1] as keyof TemplateModifiers] = match[2];
  }

  return {
    fullMatch: placeholder,
    columnRef,
    isIndex,
    modifiers,
  };
}

function evaluatePlaceholder(
  parsed: ParsedPlaceholder,
  csvRow: string[],
  csvHeaders: string[]
): string {
  let value = "";
  if (parsed.isIndex) {
    value = csvRow[Number.parseInt(parsed.columnRef, 10)] ?? "";
  } else {
    const idx = csvHeaders.indexOf(parsed.columnRef);
    if (idx === -1) {
      throw new Error(`Column "${parsed.columnRef}" not found in CSV headers`);
    }
    value = csvRow[idx] ?? "";
  }

  value = value.trim();
  if (!value && parsed.modifiers.fallback) {
    value = parsed.modifiers.fallback;
  }
  if (value) {
    if (parsed.modifiers.prefix) {
      value = parsed.modifiers.prefix + value;
    }
    if (parsed.modifiers.postfix) {
      value += parsed.modifiers.postfix;
    }
  }
  return value;
}

export function parseTemplate(
  template: string,
  csvRow: string[],
  csvHeaders: string[]
): string {
  const placeholderRegex = /\{\{[^}]+\}\}/g;
  const matches = template.match(placeholderRegex);
  if (!matches) {
    return template;
  }

  let result = template;
  for (const match of matches) {
    const parsed = parsePlaceholder(match);
    const value = evaluatePlaceholder(parsed, csvRow, csvHeaders);
    result = result.replace(parsed.fullMatch, value);
  }

  return result.trim();
}

export function validateTemplate(
  template: string,
  csvHeaders?: string[]
): { error?: string; valid: boolean } {
  try {
    const placeholderRegex = /\{\{[^}]+\}\}/g;
    const matches = template.match(placeholderRegex);
    if (!matches) {
      return { valid: true };
    }

    for (const match of matches) {
      const parsed = parsePlaceholder(match);
      if (
        csvHeaders &&
        !parsed.isIndex &&
        !csvHeaders.includes(parsed.columnRef)
      ) {
        return {
          valid: false,
          error: `Column "${parsed.columnRef}" not found in CSV headers`,
        };
      }
    }
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid template syntax",
    };
  }
}

export function getTemplateExamples(): Array<{
  description: string;
  template: string;
}> {
  return [
    {
      template: '{{"First Name"}} {{"Last Name"}}',
      description: "Combine two columns (by name) with a space",
    },
    {
      template: '{{"Prefix" postfix=" "}}{{"Name"}}',
      description: "Add postfix only if Prefix is not empty",
    },
    {
      template: '{{"Email" fallback="noemail@example.com"}}',
      description: "Use fallback value if Email is empty",
    },
    {
      template: "{{[0]}} {{[1]}}",
      description: "Combine column 0 and column 1 (by index) with a space",
    },
    {
      template: '{{[2] fallback="-"}}',
      description: "Column 2 by index, use fallback if empty",
    },
  ];
}
