#!/usr/bin/env python3
"""
The web app's Inter Tight, small (public/fonts/inter-tight/, loaded by
public/index.html). The phone keeps the full TTFs from @expo-google-fonts.

Each weight the app uses (T.display 600, T.brand 500, T.displayLight 400,
src/theme.ts) is cut in two, the way Google Fonts serves it:
  <weight>-latin.woff2  Latin, the punctuation, and every other character the
                        app's own source uses (arrows, ticks, dots), preloaded
  <weight>-more.woff2   everything else the TTF has (Latin Extended, Greek,
                        Cyrillic, Vietnamese), fetched only when a page has
                        such a character, say in a task's name
so between them the web has every glyph it had with the TTF.

Run from the project root after changing the font or adding a new symbol:
  pip install fonttools brotli && python3 scripts/subset-fonts.py
It writes the fonts and the preloads into public/index.html itself.
"""
import os
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'node_modules', '@expo-google-fonts', 'inter-tight')
OUT = os.path.join(ROOT, 'public', 'fonts', 'inter-tight')
WEIGHTS = {'400': '400Regular', '500': '500Medium', '600': '600SemiBold'}

# Google Fonts' "latin" range, as on the landing site (nura-site/site.css)
LATIN = ('U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, '
         'U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD')


def parse_ranges(text):
    out = set()
    for part in text.split(','):
        a, _, b = part.strip()[2:].partition('-')
        out.update(range(int(a, 16), int(b or a, 16) + 1))
    return out


def as_ranges(points):
    points = sorted(points)
    runs, start, prev = [], None, None
    for p in points:
        if start is None:
            start = prev = p
        elif p == prev + 1:
            prev = p
        else:
            runs.append((start, prev))
            start = prev = p
    if start is not None:
        runs.append((start, prev))
    return ', '.join(f'U+{a:04X}' if a == b else f'U+{a:04X}-{b:04X}' for a, b in runs)


def used_in_source():
    """Every non-ASCII character in app/ and src/ (copy, and the symbols drawn as text)."""
    chars = set()
    for top in ('app', 'src'):
        for folder, _, files in os.walk(os.path.join(ROOT, top)):
            for f in files:
                if f.endswith(('.ts', '.tsx')):
                    with open(os.path.join(folder, f), encoding='utf8') as fh:
                        chars.update(ord(c) for c in fh.read() if ord(c) > 127)
    return chars


def cut(ttf, points, dest):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = opts.layout_features + ['tnum']   # the defaults (kerning, ligatures) and tabular numbers (learned.tsx)
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = False              # browsers don't need TrueType hints
    font = subset.load_font(ttf, opts)
    s = subset.Subsetter(opts)
    s.populate(unicodes=points)
    s.subset(font)
    subset.save_font(font, dest, opts)
    return os.path.getsize(dest)


def main():
    os.makedirs(OUT, exist_ok=True)
    want = parse_ranges(LATIN) | used_in_source()
    for weight, name in WEIGHTS.items():
        ttf = os.path.join(SRC, name, f'InterTight_{name}.ttf')
        has = set(TTFont(ttf).getBestCmap())
        latin, more = has & want, has - want
        a = cut(ttf, latin, os.path.join(OUT, f'{weight}-latin.woff2'))
        b = cut(ttf, more, os.path.join(OUT, f'{weight}-more.woff2'))
        print(f'{weight}: latin {a // 1024} KB, more {b // 1024} KB', file=sys.stderr)
    write_html(as_ranges(latin), as_ranges(more))


def write_html(latin, more):
    """The preloads and @font-face rules in public/index.html, between its fonts markers.
    The ranges are the same for every weight: the TTFs share one character set."""
    base = '/fonts/inter-tight'
    lines = [f'<link rel="preload" href="{base}/{w}-latin.woff2" as="font" type="font/woff2" crossorigin />'
             for w in WEIGHTS]
    lines.append('<style id="nura-fonts">')
    for w, name in WEIGHTS.items():
        family = f'InterTight_{name}'
        # swap: the text shows at once, in the phone's own font if these are ever slow
        lines.append(f"  @font-face {{ font-family: '{family}'; font-display: swap; "
                     f"src: url({base}/{w}-latin.woff2) format('woff2'); unicode-range: {latin}; }}")
        lines.append(f"  @font-face {{ font-family: '{family}'; font-display: swap; "
                     f"src: url({base}/{w}-more.woff2) format('woff2'); unicode-range: {more}; }}")
    lines.append('</style>')
    html_path = os.path.join(ROOT, 'public', 'index.html')
    with open(html_path, encoding='utf8') as fh:
        html = fh.read()
    block = '<!-- fonts:start -->\n' + ''.join(f'    {l}\n' for l in lines) + '    <!-- fonts:end -->'
    html, n = re.subn(r'<!-- fonts:start -->.*?<!-- fonts:end -->', lambda _: block, html, flags=re.S)
    if n != 1:
        sys.exit('public/index.html has no <!-- fonts:start --> ... <!-- fonts:end --> block')
    with open(html_path, 'w', encoding='utf8') as fh:
        fh.write(html)


if __name__ == '__main__':
    main()
