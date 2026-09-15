# Austrian chart of accounts (EKR)

**Standard:** KFS/BW 6 — Österreichischer Einheitskontenrahmen (2017),
Kammer der Steuerberater und Wirtschaftsprüfer.

The EKR is the usual Austrian Geschäftsbuchhaltung chart. It is **not** German
SKR 03/04 and **not** DATEV SKR 07. Class **4 is revenue** (`Betriebliche
Erträge`). Operating expenses for a service firm almost all sit in **class 7**.

Do not use `4400` as a default expense account — that range is Erlöse.

## Digit scheme

| Digits | Meaning | Example |
|--------|---------|---------|
| 1 | Kontenklasse | `7` Aufwand |
| 2 | Kontengruppe | `73` Reise / Kfz / Nachrichten |
| 3 | Konto (official EKR) | `734` Reise- und Fahrtaufwand |
| 4+ | company plan (allowed) | `7340` starter account in this pack |

KFS/BW 6 is published at 3 digits. This pack stores a 4-digit starter
(`<3-digit>0`) so the Account column has a real number. Tenants may extend
further (`7341` Inlandsreisen, `7342` Auslandsreisen, …).

## Classes

| Klasse | Name | Typical use here |
|--------|------|------------------|
| 0 | Anlagevermögen | Capitalize equipment / software over the GWG limit (`062` EDV, `067` GWG asset) |
| 4 | Betriebliche Erträge | Income — **not** expenses |
| 5 | Material / bezogene Herstellung | Production inputs, not office overhead |
| 6 | Personalaufwand | Payroll — not these expense categories |
| 7 | Abschreibungen und sonstige betriebliche Aufwendungen | **Default class for this pack** |
| 8 | Finanzergebnis, Ertragsteuern | Interest, KESt, KÖSt — not operating spend |

## Expense category → EKR

| Category code | Klasse | Account | EKR name |
|---------------|--------|---------|----------|
| `reise` | 7 | 7340 | Reise- und Fahrtaufwand (734–735; Diäten 736–737) |
| `bewirtung` | 7 | 7650 | Werbung und Repräsentation (765–767) |
| `buero` | 7 | 7600 | Büromaterial und Drucksorten |
| `miete` | 7 | 7400 | Miet- und Pachtaufwand (740–743). Energy/cleaning of rented rooms → 72, not 74. |
| `telekom` | 7 | 7380 | Nachrichtenaufwand (Telefon, Internet) |
| `porto` | 7 | 7381 | Nachrichtenaufwand (Porto) — same group 738, 4th digit split |
| `literatur` | 7 | 7630 | Fachliteratur und Zeitungen (763–764) |
| `fortbildung` | 7 | 7770 | Aus- und Fortbildung |
| `versicherung` | 7 | 7700 | Versicherungen (770–774). Kfz insurance may follow 732 instead. |
| `kfz` | 7 | 7320 | Kfz-Aufwand PKW und Kombis (LKW = 733) |
| `werbung` | 7 | 7660 | Werbung und Repräsentation |
| `beratung` | 7 | 7750 | Beratung und Prüfung (775–776) |
| `software` | 7 | 7480 | Lizenzaufwand. Capitalizable software → class 0 (`012` / `062`). |
| `ausstattung` | 7 | 7060 | Sofortabschreibung GWG. Over the GWG limit → class 0 (`060` / `062`). |
| `bank` | 7 | 7790 | Spesen des Geldverkehrs |
| `mitglied` | 7 | 7780 | Mitgliedsbeiträge (WKO, Kammer) |
| `geschenke` | 7 | 7670 | Werbung und Repräsentation (Werbegeschenke) |
| `reparatur` | 7 | 7200 | Instandhaltung und Betriebskosten |
| `sonstige` | 7 | 7840 | Verschiedene betriebliche Aufwendungen (784–787) |

## Tax notes (not the chart)

These are EStG defaults used by the category pack, not EKR rules:

- Bewirtung: 50 % absetzbar (§ 20 Abs 1 Z 3 EStG)
- Werbegeschenke with logo: typically 100 %; purely representative gifts: 0 %
- GWG: immediate write-off up to the current statutory threshold

## How software uses this

1. `expense-categories.json` is merged into commercial settings when the user
   clicks **Standard categories (AT)** (or an agent writes the list).
2. `account_class` and `account_number` are stored on each category.
3. After merge, the tenant list is authoritative — this folder is only the pack.
