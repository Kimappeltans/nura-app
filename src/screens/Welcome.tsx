import { useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type as T, copy } from '../theme';
import { useTheme } from '../store';
import { Primary, Mica, GradientText } from '../ui';
import { IntroClip } from '../components/IntroClip';
import { SpeechBubble } from '../components/SpeechBubble';
import { useScreen } from '../screen';

/**
 * Both marks are TIGHT crops (see assets/brand): the source artwork had ~10%
 * of empty margin on every side, which made every size value a lie. Cropped
 * to the alpha bounding box, the numbers mean what they say.
 */
const stone = require('../../assets/brand/nura-logo-tight.webp');
const wordmark = require('../../assets/brand/wordmark-tight.webp');

/**
 * One screen, four things, in order of weight:
 *
 *   1. Nu and Ra — the intro clip, large, with no backdrop of its own (the
 *      frames are cut out; see IntroClip). It's the one image on the screen,
 *      so it's the biggest thing on it. When it has played through, each
 *      introduces itself in a speech bubble ("I'm Nu. I hold everything." /
 *      "I'm Ra. I pick one thing.") — the two modes explained by the
 *      characters who are the modes, the way Duolingo's owl says hello.
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
  const { width } = useScreen();
  // Nu and Ra introduce themselves once the clip has played through
  const [said, setSaid] = useState(false);

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
          {/* Where the heads are in the clip's last frame, as fractions of
              its width and height (measured on the cut-out frames). */}
          <IntroClip maxWidth={Math.min(width - 32, 440)}
            onStart={() => setSaid(false)} onEnd={() => setSaid(true)}
            overlay={(w, h) => said && (
              <>
                <SpeechBubble tone="nu" text={"I’m Nu.\nI hold everything."} clipW={w}
                  tailX={w * 0.21} tipY={h * 0.27} />
                <SpeechBubble tone="ra" text={"I’m Ra.\nI pick one thing."} clipW={w}
                  tailX={w * 0.78} tipY={h * 0.26} delay={550} />
              </>
            )} />

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
