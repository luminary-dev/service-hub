# Sinhala font slot

To use FM Bindumathi for Sinhala text, place the font file here named:

- `FMBindumathi.woff2` (preferred — smaller), or
- `FMBindumathi.ttf`

Requirements:

- It MUST be a **Unicode** Sinhala font (glyphs mapped at U+0D80–U+0DFF).
  The original/legacy FM-Bindumathi is NOT Unicode — Sinhala text will show
  as empty boxes with it. Test after adding: switch the site to සිං and check
  the homepage headline renders correctly.
- Convert TTF → WOFF2 with any font converter for faster loading (optional).

If no file is present here, the site automatically uses Noto Sans Sinhala.
A good Unicode alternative with a similar traditional feel is "Abhaya Libre"
(Google Fonts) — ask to switch if FM Bindumathi doesn't work out.
