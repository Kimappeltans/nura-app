import Svg, { Circle } from 'react-native-svg';

/** 5×7 dots per digit; ':' is one column. */
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '0', '1', '0', '1', '0', '0'],
};

/**
 * DOT-MATRIX NUMBERS (guidelines/styles.md) — only where time itself is the
 * subject: the session timer and the night clock. Leading zeros can be muted.
 */
export function DotMatrix({ text, dot = 6.2, color, muted, muteLeadingZeros }: {
  text: string;
  /** dot pitch, px */
  dot?: number;
  color: string;
  muted?: string;
  muteLeadingZeros?: boolean;
}) {
  const chars = [...text].filter(c => GLYPHS[c]);
  // a leading zero is a '0' before the first non-zero digit (and before the last digit of the minutes)
  const firstReal = chars.findIndex((c, i) => (c !== '0' && c !== ':') || i === chars.indexOf(':') - 1);
  let x = 0;
  const dots: { cx: number; cy: number; c: string }[] = [];
  chars.forEach((ch, ci) => {
    const g = GLYPHS[ch];
    const c = muteLeadingZeros && muted && ci < firstReal && ch === '0' ? muted : color;
    g.forEach((row, ry) => [...row].forEach((b, rx) => {
      if (b === '1') dots.push({ cx: (x + rx) * dot + dot / 2, cy: ry * dot + dot / 2, c });
    }));
    x += g[0].length + 1;
  });
  const w = Math.max(1, (x - 1) * dot);
  return (
    <Svg width={w} height={7 * dot}>
      {dots.map((d, i) => <Circle key={i} cx={d.cx} cy={d.cy} r={dot * 0.38} fill={d.c} />)}
    </Svg>
  );
}
