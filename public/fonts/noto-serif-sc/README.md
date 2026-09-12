# Noto Serif SC — bundled web fonts

The app retains the same Noto Serif SC face used by the previous `next/font/google` layout, at weights 400 and 600. The font files and `src/app/noto-serif-sc.css` are checked into the project, so neither a production build nor a visitor needs Google Fonts access. This is a local `@font-face` implementation; the browser fetches only Unicode partitions needed by displayed text. No font is preloaded.

## Source and copyright

- **101 existing WOFF2 partitions** were copied byte-for-byte from the project's successful Next.js development Google Fonts cache on 2026-09-12. Their original Unicode ranges, weight assignments, `font-display: swap`, and Times New Roman fallback metric adjustments are retained. The manifest records the original CSS path/hash and every asset hash.
- The font name tables identify `Noto Serif SC ExtraLight`, variable weight axis 200–900, version `2.003-H1`; “ExtraLight” is the variable font's internal name, not the 400/600 weight used by the app. The copyright is `(c) 2017-2024 Adobe (http://www.adobe.com/).` These fields match the [official Google Fonts metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/METADATA.pb).
- **One 19,228-byte supplemental WOFF2** adds the 33 GB2312 Han characters absent from those original web partitions. It was subset from the same upstream font version using FontTools 4.61.1 and Brotli 1.2.0, retaining the variable weight axis. The original 25,125,512-byte TTF was downloaded only to temporary storage and is not shipped.
- The supplemental source is pinned to Noto's commit [`985fa52c81c1d6692ccdd82bc3656e8fb932fd89`](https://github.com/notofonts/noto-cjk/tree/985fa52c81c1d6692ccdd82bc3656e8fb932fd89). [Download the original TTF](https://raw.githubusercontent.com/notofonts/noto-cjk/985fa52c81c1d6692ccdd82bc3656e8fb932fd89/google-fonts/NotoSerifSC%5Bwght%5D.ttf). Its SHA256 and the exact supplemental codepoints are in `manifest.json`.

The fonts are distributed under **SIL Open Font License 1.1**, not the application's Apache license. This directory includes the [pinned upstream OFL](https://raw.githubusercontent.com/notofonts/noto-cjk/985fa52c81c1d6692ccdd82bc3656e8fb932fd89/Serif/LICENSE) as `OFL.txt`, and the [official Google Fonts OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt) including its notice as `OFL-Google-Fonts.txt`. Keep these notices and licenses with the font files. Google and Adobe do not endorse this product.

## Verified scope and size

- 102 WOFF2 files, **6,044,588 bytes** total (about 5.76 MiB); this is the complete available package, not an initial-page download.
- CSS contains 204 web-font faces (101 original partitions plus one supplement for each of the two weights) and the original local fallback face.
- FontTools decoded every WOFF2 and checked its character map against its CSS Unicode range. Both weights cover all **6,763 GB2312-encodable Han characters** and all **1,493 unique CJK characters found in the current `.ts`, `.tsx`, and `.css` source** at verification time.
- Effective coverage is 13,697 codepoints per weight. This is not all Unicode; characters outside this coverage continue to use the existing system fallback stack. No existing Google web-font glyph was removed, and there is no application-text-only subset.

## Updating

Preserve the bundled assets for reproducible builds. To update, use the official upstream source and OFL, record a pinned source/hash, regenerate all affected partitions and the manifest together, and recheck both 400 and 600 character coverage. Do not restore a build-time `next/font/google` download or use a remote CSS import.
