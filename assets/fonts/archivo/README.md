# Archivo for the PDF result sheets

`api/result-sheet.ts` embeds these fonts in every result sheet, keeping only
the characters each sheet uses. They are static cuts of the same Archivo
variable font the website loads, at the widths set in `app/globals.css`:

| File                            | Width | Weight | Used for                            |
| ------------------------------- | ----: | -----: | ----------------------------------- |
| `Archivo-ExpandedExtraBold.ttf` |   125 |    800 | Titles (`--wide`)                   |
| `Archivo-SemiExpandedBold.ttf`  |   112 |    700 | Labels and headings (`--semi-wide`) |
| `Archivo-Regular.ttf`           |   100 |    400 | Body text                           |
| `Archivo-SemiBold.ttf`          |   100 |    600 | Driver names                        |
| `Archivo-NarrowMedium.ttf`      |    78 |    500 | Times and gaps (`--narrow`)         |
| `Archivo-NarrowExtraBold.ttf`   |    78 |    800 | Car numbers, positions, best laps   |

pdf-lib cannot pick an instance out of a variable font, so each style is its
own file. In the two narrow cuts the digits map to Archivo's tabular figures,
so every digit has the same width and times line up in columns.

## Source

- `Archivo[wdth,wght].ttf` from
  [google/fonts `ofl/archivo`](https://github.com/google/fonts/tree/main/ofl/archivo)
  (SHA-256 `0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053`),
  built upstream from
  [Omnibus-Type/Archivo](https://github.com/Omnibus-Type/Archivo).
- Licensed under the SIL Open Font License 1.1. See `OFL.txt`. The licence
  names no Reserved Font Name, so the modified cuts keep the Archivo name.

## Rebuilding

```bash
python3 -m pip install fonttools
python3 assets/fonts/archivo/make-static.py 'Archivo[wdth,wght].ttf' assets/fonts/archivo
```

`vercel.json` ships this folder with the `api/result-sheet.ts` function.
