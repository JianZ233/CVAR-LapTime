"""Cut static Archivo instances for the PDF result sheet.

Usage: python make_static.py <Archivo[wdth,wght].ttf> <out_dir>
Requires fontTools >= 4.40.
"""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

# (file stem, style label, wdth, wght, tabular digits)
INSTANCES = [
    ('Archivo-ExpandedExtraBold', 'Expanded ExtraBold', 125, 800, False),
    ('Archivo-SemiExpandedBold', 'SemiExpanded Bold', 112, 700, False),
    ('Archivo-Regular', 'Regular', 100, 400, False),
    ('Archivo-SemiBold', 'SemiBold', 100, 600, False),
    ('Archivo-NarrowMedium', 'Narrow Medium', 78, 500, True),
    ('Archivo-NarrowExtraBold', 'Narrow ExtraBold', 78, 800, True),
]


def tabular_digit_map(font):
    """Digit glyph -> its tnum alternate, read from the GSUB tnum lookups."""
    gsub = font['GSUB'].table
    lookups = {
        index
        for record in gsub.FeatureList.FeatureRecord
        if record.FeatureTag == 'tnum'
        for index in record.Feature.LookupListIndex
    }
    mapping = {}
    for index in lookups:
        for subtable in gsub.LookupList.Lookup[index].SubTable:
            mapping.update(getattr(subtable, 'mapping', {}) or {})
    return mapping


def main(source, out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for stem, style, wdth, wght, tabular in INSTANCES:
        font = TTFont(source)
        instantiateVariableFont(
            font, {'wdth': wdth, 'wght': wght}, inplace=True, updateFontNames=False
        )
        for tag in ('STAT', 'DSIG'):
            if tag in font:
                del font[tag]
        if tabular:
            mapping = tabular_digit_map(font)
            for table in font['cmap'].tables:
                if not table.isUnicode():
                    continue
                for code in range(0x30, 0x3A):
                    glyph = table.cmap.get(code)
                    if glyph in mapping:
                        table.cmap[code] = mapping[glyph]
        family = 'Archivo' if style in ('Regular', 'SemiBold') else f'Archivo {style.rsplit(" ", 1)[0]}'
        subfamily = style.rsplit(' ', 1)[-1] if family != 'Archivo' else style
        full = f'Archivo {style}'
        name = font['name']
        for record in list(name.names):
            if record.nameID in (1, 2, 3, 4, 6, 16, 17, 25):
                name.removeNames(nameID=record.nameID)
        name.setName(family, 1, 3, 1, 0x409)
        name.setName('Regular', 2, 3, 1, 0x409)
        name.setName(f'{stem};CVAR result sheet static cut', 3, 3, 1, 0x409)
        name.setName(full, 4, 3, 1, 0x409)
        name.setName(stem, 6, 3, 1, 0x409)
        name.setName('Archivo', 16, 3, 1, 0x409)
        name.setName(style, 17, 3, 1, 0x409)
        font['OS/2'].usWeightClass = wght
        font['OS/2'].usWidthClass = {125: 7, 112: 6, 100: 5, 78: 3}[wdth]
        path = out / f'{stem}.ttf'
        font.save(path)
        print(f'{path.name}: wdth={wdth} wght={wght} {path.stat().st_size} bytes')


if __name__ == '__main__':
    main(*sys.argv[1:3])
