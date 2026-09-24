import { View, Text, Image, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type as T, copy } from '../theme';
import { useTheme } from '../store';
import { Primary, Mica, GradientText } from '../ui';
import { IntroClip } from '../components/IntroClip';

/**
 * Both marks are TIGHT crops (see assets/brand): the source artwork had ~10%
 * of empty margin on every side, which made every size value a lie. Cropped
 * to the alpha bounding box, the numbers mean what they say.
 */
const stone = require('../../assets/brand/nura-logo-tight.png');
const wordmark = require('../../assets/brand/wordmark-tight.png');

/**
 * One screen, four things, in order of weight:
 *
 *   1. Nu and Ra — the intro clip, large, with no backdrop of its own (the
 *      frames are cut out; see IntroClip). It's the one image on the screen,
 *      so it's the biggest thing on it.
 *   2. The slogan — the brand's own three beats, the last in the sunrise
 *      gradient — and one plain line under it saying what Nura does.
 *      The headline, directly under the picture it describes.
 *   3. Get started.
 *   4. The mark and name, small, at the top — a signature. At full size it
 *      was a second headline competing with the slogan.
 *
 * The signature is centred at the top; Nu and Ra sit low, with the slogan
 * given room above and below before the button.
 */
export default function Welcome(
  { onNext, onSignIn }: { onNext: () => void; onSignIn: () => void },
) {
  const t = useTheme();
  const { width } = useWindowDimensions();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 10 }}>

        {/* the signature: the stone centred over the name — widths are the
            tight crops' true aspect ratios */}
        <View style={{ alignItems: 'center', gap: 8, marginTop: 14 }}>
          <Image source={stone} style={{ width: 40, height: 45 }} resizeMode="contain" />
          <Image source={wordmark} style={{ width: 72, height: 20, tintColor: t.ink }} resizeMode="contain" />
        </View>

        {/* Nu and Ra sit low, just above the words, so the slack collects
            above them rather than under the slogan. */}
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
          <IntroClip maxWidth={Math.min(width - 32, 440)} />

          <View style={{ alignSelf: 'stretch', marginTop: 40, marginBottom: 48 }}>
            <Text style={{
              color: t.ink, fontSize: 34, lineHeight: 40, fontFamily: T.display,
              letterSpacing: -1, textAlign: 'center',
            }}>{copy.slogan[0]}</Text>
            <Text style={{
              color: t.ink, fontSize: 34, lineHeight: 40, fontFamily: T.display,
              letterSpacing: -1, textAlign: 'center',
            }}>{copy.slogan[1]}</Text>
            {/* the emphasis lands on the follow-through, the last beat */}
            <GradientText size={34} lineHeight={40} colors={[t.nu, t.nuSoft, t.ra, t.raDeep]} id="slogan">
              {copy.slogan[2]}
            </GradientText>
            {/* What Nura IS, in plain words — the slogan is the brand's voice,
                but someone who installed five apps this week needs to know in
                one line that this is a to-do app and what it does differently. */}
            <Text style={{
              color: t.ink2, fontSize: 16, lineHeight: 23, textAlign: 'center',
              marginTop: 14, alignSelf: 'center', maxWidth: 300,
            }}>Put everything down. Nura hands you one thing to start.</Text>
          </View>
        </View>

        <View style={{ gap: 14 }}>
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
