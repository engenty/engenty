# Bundled PDF fonts

- `google-fonts/` — SIL OFL licensed (license files alongside the fonts);
  redistributed here as permitted.
- `fontshare/` — **not included in the open-source repo.** The Fontshare
  families (Satoshi, Author, Bespoke Serif, Boska, Chillax, Clash Grotesk,
  General Sans, Ranade, Sentient, Stardom, Supreme, Switzer, Telma, Zodiak)
  are licensed under the ITF Fontshare EULA, which does not permit
  redistribution. Download them yourself from <https://www.fontshare.com>
  and place each family's OTF folder under
  `packages/pdf-service/assets/fonts/fontshare/<Family>_Complete/` (see
  `src/engine/localFonts.ts` for the exact expected paths). Missing files
  are skipped at registration and templates fall back to Helvetica.
