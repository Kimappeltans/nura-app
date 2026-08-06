import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { radius, type as T } from '../theme';
import { labelById, type LabelId } from '../labels';
import { useTheme } from '../store';

/**
 * One glyph per label, drawn at a single stroke weight so a column of them
 * reads as one family rather than a ransom note of borrowed icons.
 *
 * Colour is never the only signal. Around 8% of men have a colour-vision
 * deficiency, and a wall of coloured dots is meaningless to anyone until
 * they've memorised the legend — so the shape carries the meaning and the
 * colour reinforces it.
 */
const GLYPH: Record<LabelId, (c: string) => React.ReactNode> = {
  work: c => (
    <>
      <Path d="M3 8.5A2 2 0 015 6.5h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke={c} />
      <Path d="M9 6.5V5a2 2 0 012-2h2a2 2 0 012 2v1.5M3 12h18" stroke={c} />
    </>
  ),
  personal: c => (
    <>
      <Circle cx="12" cy="8" r="3.6" stroke={c} />
      <Path d="M4.5 20c.9-3.6 3.9-5.6 7.5-5.6s6.6 2 7.5 5.6" stroke={c} />
    </>
  ),
  health: c => (
    <Path d="M20.3 6.6a4.6 4.6 0 00-6.6 0L12 8.3l-1.7-1.7a4.6 4.6 0 10-6.6 6.5L12 21l8.3-7.9a4.6 4.6 0 000-6.5z" stroke={c} />
  ),
  errands: c => (
    <>
      <Path d="M3 4h2.1l2.3 11.2a1.6 1.6 0 001.6 1.3h8.6a1.6 1.6 0 001.6-1.3L21 7.3H6" stroke={c} />
      <Circle cx="9.5" cy="20" r="1.3" stroke={c} />
      <Circle cx="17" cy="20" r="1.3" stroke={c} />
    </>
  ),
  money: c => (
    <>
      <Path d="M3 8.5A2 2 0 015 6.5h13a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke={c} />
      <Path d="M16 11.5h4v4h-4a2 2 0 010-4z" stroke={c} />
    </>
  ),
  study: c => (
    <>
      <Path d="M4 5.5A1.5 1.5 0 015.5 4H11a2 2 0 012 2v13a1.6 1.6 0 00-1.6-1.6H5.5A1.5 1.5 0 014 16z" stroke={c} />
      <Path d="M20 5.5A1.5 1.5 0 0018.5 4H13a2 2 0 00-2 2v13a1.6 1.6 0 011.6-1.6h6.9A1.5 1.5 0 0021 16z" stroke={c} />
    </>
  ),
  people: c => (
    <>
      <Circle cx="9" cy="8.2" r="3.2" stroke={c} />
      <Path d="M2.8 19.4c.8-3.1 3.3-4.9 6.2-4.9s5.4 1.8 6.2 4.9" stroke={c} />
      <Path d="M16.2 5.4a3.2 3.2 0 010 5.9M17.6 14.9c2.1.5 3.4 2.1 3.9 4.5" stroke={c} />
    </>
  ),
  home: c => (
    <>
      <Path d="M3.4 10.6L12 3.8l8.6 6.8" stroke={c} />
      <Path d="M5.5 9.4V19a1.4 1.4 0 001.4 1.4h10.2A1.4 1.4 0 0018.5 19V9.4" stroke={c} />
    </>
  ),
};

export function LabelGlyph({ id, size = 16, color }: { id: LabelId; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {GLYPH[id](color)}
    </Svg>
  );
}

/** The tinted tile that sits at the head of a task row. */
export function LabelTile({ id, size = 30 }: { id?: string | null; size?: number }) {
  const t = useTheme();
  const l = labelById(id);
  const c = l ? (t.key === 'ra' ? l.onLight : l.color) : t.ink3;
  return (
    <View style={{
      width: size, height: size, borderRadius: radius.sm + 2,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: l ? `${c}22` : 'transparent',
      borderWidth: l ? 0 : 1, borderColor: t.stroke,
    }}>
      {l ? <LabelGlyph id={l.id} size={size * 0.55} color={c} />
         : <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.ink3 }} />}
    </View>
  );
}

/** Name + glyph, for the picker and for filter chips. */
export function LabelChip(
  { id, on, onPress }: { id: LabelId; on: boolean; onPress: () => void },
) {
  const t = useTheme();
  const l = labelById(id)!;
  const c = t.key === 'ra' ? l.onLight : l.color;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 7,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
      backgroundColor: on ? `${c}26` : 'transparent',
      borderWidth: 1.5, borderColor: on ? c : t.strokeStrong,
    }}>
      <LabelGlyph id={l.id} size={15} color={on ? c : t.ink} />
      <Text style={{ color: on ? c : t.ink, fontSize: 13.5, fontFamily: on ? T.brand : undefined }}>
        {l.name}
      </Text>
    </View>
  );
}
