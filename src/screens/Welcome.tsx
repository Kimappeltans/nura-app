import { View, Text, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type as T, copy } from '../theme';
import { useTheme } from '../store';
import { Primary, Mica, GradientText } from '../ui';
import { IntroClip } from '../components/IntroClip';

/**
 * Both marks are TIGHT crops. The original stone artwork sits in a 1254px
 * canvas with ~10% of empty transparent margin on every side — and
 * asymmetrically, 51px above versus 139px below. That one fact caused every
 * complaint the lockup attracted: the gap to the wordmark always looked wider
 * than the layout asked for, the optical centre sat above the box centre so a
 * centred wordmark read as low, and every size value was a lie (asking for
 * 56px got 46px of visible stone). Cropped to the alpha bounding box, the
 * numbers mean what they say and centring is true.
 */
// the mark: sun disc over water, the whole Nu+Ra idea in one object.
// Tight-cropped (833x944) — the source has ~200px of invisible margin, same
// trap as the old one, which made every size value a lie.
const stone = require('../../assets/brand/nura-logo-tight.png');
const wordmark = require('../../assets/brand/wordmark-tight.png');

/**
 * One screen, and no invented tagline on it — the three lines are the brand's
 * own slogan, the middle one filled with the sunrise gradient.
 *
 * The two static characters are replaced by the intro clip, framed.
 *
 * On the framing: the clip cannot be dropped straight onto cream, because its
 * backdrop can't be keyed out. Measured on frame 20 — the backdrop runs from
 * #03092D at the corners to #51475A in the lit gap between the characters,
 * while Nu's shadow side sits at #0D1640. Nu is *darker than parts of its own
 * background*, so any threshold loose enough to remove the centre glow punches
 * holes straight through him. That isn't a tuning problem, it's an overlap.
 *
 * So it's presented as what it is: a framed panel, in the clip's own
 * background colour, with a hairline and a soft shadow so it reads as a
 * deliberate window rather than a rectangle someone forgot to mask. If the
 * animation is ever re-exported over a flat light background — or with alpha —
 * the frame comes off and it sits directly on the cream.
 */
export default function Welcome(
  { onNext, onSignIn }: { onNext: () => void; onSignIn: () => void },
) {
  const t = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />

      <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 14, paddingBottom: 10, alignItems: 'center' }}>

        {/* Mark, then name. Widths are the tight crops' true aspect ratios —
            1020:1064 and 799:222 — so nothing is squashed. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <Image source={stone} style={{ width: 80, height: 91 }} resizeMode="contain" />
          <Image source={wordmark} style={{ width: 126, height: 35, tintColor: t.ink }} resizeMode="contain" />
        </View>

        {/* Everything between the lockup and the button is centred in whatever
            space is left, so slack is shared above and below instead of dumped
            in one dead band. */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', alignSelf: 'stretch' }}>

          <View style={{ alignSelf: 'stretch' }}>
            <Text style={{
              color: t.ink, fontSize: 34, lineHeight: 43, fontFamily: T.display,
              letterSpacing: -1, textAlign: 'center',
            }}>{copy.slogan[0]}</Text>

            <GradientText size={34} lineHeight={43} colors={[t.ra, t.raDeep]} id="slogan">
              {copy.slogan[1]}
            </GradientText>

            <Text style={{
              color: t.ink, fontSize: 34, lineHeight: 43, fontFamily: T.display,
              letterSpacing: -1, textAlign: 'center',
            }}>{copy.slogan[2]}</Text>
          </View>

          {/* No sub-line. The slogan says it, and the clip shows it — a
              third explanation of the same idea just crowds both. */}
          {/* No frame any more. The screen and the clip are both dark navy
              now, so the panel that was hiding the un-keyable backdrop has
              nothing left to hide — see the note at the top of this file. */}
          <IntroClip style={{ marginTop: 26 }} />
        </View>

        <View style={{ alignSelf: 'stretch', gap: 14 }}>
          <Primary label={copy.welcomeCta} tone="ra" onPress={onNext} />
          <Pressable onPress={onSignIn} hitSlop={10}>
            <Text style={{ color: t.ink3, fontSize: 13.5, textAlign: 'center' }}>
              Already have an account? <Text style={{ color: t.raDeep, fontFamily: T.brand }}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
