# Notice

Portions of this package are adapted from [Hermes Agent](https://github.com/NousResearch/hermes-agent)
(`hermes-agent/LICENSE`, Copyright (c) 2025 Nous Research, MIT License). Bodies are rewritten
for Engenty tools; names, procedures, and credits below identify the upstream skill.

| Skill | Upstream path | Original author | Original license |
|---|---|---|---|
| `plan` | `skills/software-development/plan` | Hermes Agent (writing-craft adapted from obra/superpowers) | MIT |
| `test-driven-development` | `skills/software-development/test-driven-development` | Hermes Agent (adapted from obra/superpowers) | MIT |
| `systematic-debugging` | `skills/software-development/systematic-debugging` | Hermes Agent (adapted from obra/superpowers) | MIT |
| `requesting-code-review` | `skills/software-development/requesting-code-review` | Hermes Agent (adapted from obra/superpowers + MorAlekss) | MIT |
| `simplify-code` | `skills/software-development/simplify-code` | Hermes Agent (inspired by Claude Code /simplify) | MIT |
| `spike` | `skills/software-development/spike` | Hermes Agent (adapted from gsd-build/get-shit-done) | MIT |
| `grounded-citations` | `skills/research/grounded-citations` | Hermes Agent + Teknium | MIT |
| `xlsx` | `skills/productivity/xlsx` | Nous Research | MIT |
| `pdf` | `skills/productivity/pdf` | Nous Research | MIT |
| `docx` | `skills/productivity/docx` | Nous Research | MIT |
| `ocr-and-documents` | `skills/productivity/ocr-and-documents` | Hermes Agent | MIT |
| `document-to-action-items` | `skills/productivity/document-to-action-items` | Ben Barclay (benbarclay), Hermes Agent | MIT |
| `meeting-action-items` | `skills/productivity/meeting-action-items` | Ben Barclay (benbarclay), Hermes Agent | MIT |
| `weekly-review-planning` | `skills/productivity/weekly-review-planning` | Ben Barclay (benbarclay), Hermes Agent | MIT |
| `pptx` | — | Engenty (original; not Anthropic document skills) | MIT |
| `canvas-design` | `skills/canvas-design` | Anthropic, PBC (procedure); bundled faces are SIL OFL | Apache-2.0 |

`nano-pdf` was not adapted (redundant with `pdf`). Anthropic `skills/pptx` and
`skills/docx` are proprietary — do not vendor them. Distinct-upstream
`LICENSE.txt` files are added only when a skill's license is not Nous/Hermes MIT.
