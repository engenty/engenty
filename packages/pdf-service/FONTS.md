# PDF Font System

This package supports custom fonts for PDF generation, including Fontshare fonts and Google Fonts.

## Font Registration

Fonts are registered automatically when rendering PDFs if:
1. The theme data includes font family references
2. Font manifest entries are provided (pre-resolved URLs from database)
3. Local font files are available and configured

## Font File Requirements

### Fontshare Fonts

**CRITICAL**: Fontshare fonts must use **OTF files from the OTF folder**, NOT TTF files from the WEB folder.

The TTF files in Fontshare's WEB folder have corrupted metadata where the font family name is literally "false" instead of the actual font name. This breaks font matching in react-pdf (fontWeight: 700 won't find the bold variant).

**Use OTF files only** from paths like:
- `Fonts/OTF/Satoshi-Regular.otf`
- `Fonts/OTF/Supreme-Bold.otf`

### Static Weight Files (Preferred)

Static weight files are preferred over variable fonts because `@react-pdf/renderer` cannot properly interpret variable font axes. Each weight needs a separate file for proper bold/weight rendering.

### Font File Structure

Fonts are installed in `packages/pdf-service/assets/fonts/` (same layout as engency):

```
packages/pdf-service/assets/fonts/
├── google-fonts/
│   ├── Open_Sans/
│   │   └── static/
│   │       ├── OpenSans-Light.ttf
│   │       ├── OpenSans-Regular.ttf
│   │       ├── OpenSans-Medium.ttf
│   │       ├── OpenSans-SemiBold.ttf
│   │       ├── OpenSans-Bold.ttf
│   │       └── OpenSans-ExtraBold.ttf
│   ├── Inter/
│   └── ...
├── fontshare/
│   ├── Satoshi_Complete/
│   │   └── Fonts/
│   │       └── OTF/
│   │           ├── Satoshi-Light.otf
│   │           ├── Satoshi-Regular.otf
│   │           ├── Satoshi-Medium.otf
│   │           ├── Satoshi-Bold.otf
│   │           └── Satoshi-Black.otf
│   ├── Supreme_Complete/
│   │   └── Fonts/
│   │       └── OTF/
│   │           ├── Supreme-Thin.otf
│   │           ├── Supreme-Extralight.otf
│   │           └── ...
│   └── ...
└── google-fonts/
    ├── Inter/
    │   └── static/
    │       └── Inter_18pt-Regular.ttf
    └── ...
```

## Installing Additional Fonts

### Fonts CLI (recommended)

From the `@engenty/pdf-service` package:

```bash
pnpm run fonts list                  # List installed fonts
pnpm run fonts list --available      # List fonts available to install
pnpm run fonts install <name>        # Install a Google Font (e.g. Poppins)
pnpm run fonts remove <name>         # Remove a font
```

**Google Fonts** are downloaded automatically from the [google/fonts](https://github.com/google/fonts) repo. Only fonts with static TTF files are supported (variable fonts are skipped).

**Fontshare** fonts require manual download from [fontshare.com](https://www.fontshare.com/) — extract OTF files to `assets/fonts/fontshare/<Family>_Complete/Fonts/OTF/`.

### Manual installation

To add fonts (e.g. from engency), copy the font folders into `assets/fonts/`:

```bash
# From engenty repo root, copy from engency:
cp -r /path/to/engency/src/assets/fonts/google-fonts/Inter packages/pdf-service/assets/fonts/google-fonts/
cp -r /path/to/engency/src/assets/fonts/fontshare/Supreme_Complete packages/pdf-service/assets/fonts/fontshare/
```

Then update `src/engine/localFonts.ts`, `packages/pdf-templates/src/defaults.ts`, and `packages/pdf-templates/src/font-weights.ts`.

## Configuring Font Paths

Font paths are configured in `src/engine/localFonts.ts`. The `fontPath()` helper resolves paths relative to `assets/fonts/`. Add new entries to the `LOCAL_FONTS` map:

```typescript
  "Satoshi": {
    w300: fontPath("fontshare", "Satoshi_Complete", "Fonts", "OTF", "Satoshi-Light.otf"),
    w400: fontPath("fontshare", "Satoshi_Complete", "Fonts", "OTF", "Satoshi-Regular.otf"),
    w500: fontPath("fontshare", "Satoshi_Complete", "Fonts", "OTF", "Satoshi-Medium.otf"),
    w700: fontPath("fontshare", "Satoshi_Complete", "Fonts", "OTF", "Satoshi-Bold.otf"),
    w900: fontPath("fontshare", "Satoshi_Complete", "Fonts", "OTF", "Satoshi-Black.otf"),
  },
```

## Font Manifest (Database-Driven)

Fonts can also be provided via a font manifest from the database. This allows dynamic font URLs (e.g., from cloud storage).

The manifest format:

```typescript
type FontManifestItem = {
  family: string;
  weight?: number;  // 100-900
  style?: string;    // "normal" | "italic"
  url: string;        // Absolute URL or file path
};
```

Example:

```typescript
const fontManifest: FontManifestItem[] = [
  { family: "Supreme", weight: 400, style: "normal", url: "https://cdn.example.com/fonts/Supreme-Regular.otf" },
  { family: "Supreme", weight: 700, style: "normal", url: "https://cdn.example.com/fonts/Supreme-Bold.otf" },
];
```

## Available Fonts

The following fonts are available in the font dropdown (see `packages/pdf-templates/src/defaults.ts`):

### Built-in
- Helvetica
- Times-Roman
- Courier

### Google Fonts (installable via `pnpm run fonts install`)
- Inter, Roboto, Open Sans, Montserrat, Lato (pre-installed)
- Playfair Display, Raleway, Nunito, Source Sans 3, Oswald, Work Sans, Poppins, Ubuntu, PT Sans

### Fontshare
- Satoshi
- General Sans
- Clash Grotesk
- Switzer
- Supreme
- Author
- Chillax
- Ranade
- Boska
- Bespoke Serif
- Sentient
- Telma
- Zodiak
- Stardom

## Font Weight Mapping

Font weights are normalized to numeric values (100-900) as required by react-pdf:

- 100: Thin / Hairline
- 200: Extra Light / Ultra Light
- 300: Light
- 400: Regular / Normal / Book
- 500: Medium
- 600: Semi Bold / Demi Bold
- 700: Bold
- 800: Extra Bold / Ultra Bold
- 900: Black / Heavy / Fat / Poster

## Implementation Details

- Fonts are registered with both `normal` and `italic` variants (react-pdf requires both)
- Font registration happens before StyleSheet creation
- Font weights must match exactly (400 for regular, 700 for bold, etc.)
- Built-in fonts (Helvetica, Times-Roman, Courier) don't need registration
- Font registration is cached per process (fonts registered once remain available)

## Troubleshooting

### Font not rendering / falling back to Helvetica

1. Check that font files exist at the configured paths
2. Verify font files are OTF (for Fontshare) or TTF (for Google Fonts)
3. Ensure font family name matches exactly (case-sensitive)
4. Check that required weights (400, 700) are available
5. Verify font manifest URLs are accessible (if using manifest)

### Font weight not working

1. Ensure the exact weight file exists (e.g., `Satoshi-Bold.otf` for weight 700)
2. Check that fontWeight is numeric (not string like "bold")
3. Verify the weight is registered (check console logs)

### Font registration errors

1. Check file paths are absolute or correctly resolved
2. Verify file permissions (Node.js process must be able to read files)
3. Ensure font files are valid (not corrupted)
4. Check console for specific error messages
