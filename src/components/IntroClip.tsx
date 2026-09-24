import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { View, Image, Pressable, useWindowDimensions, type ViewStyle } from 'react-native';

/**
 * The intro animation, played as a frame sequence.
 *
 * Not a <Video>: neither expo-video nor expo-av is a dependency here, and
 * Metro can't resolve a module that isn't installed — importing one would
 * break the bundle rather than degrade gracefully. Adding it needs
 * `npx expo install expo-video` on a machine with npm access, plus a native
 * rebuild.
 *
 * A frame sequence is the right fallback in THIS case, and it's worth being
 * precise about why, because the same technique looked broken on the mascots.
 * Those were four independently drawn poses — the arm teleported and the body
 * changed size between them, so no playback rate could make them read as
 * motion. These are 63 genuinely consecutive frames sampled at 12fps from a
 * single rendered clip: every frame is a small delta from the last, which is
 * exactly the condition frame playback needs.
 *
 * 12fps rather than the source's 24 halves the payload to ~1.6MB with no
 * visible cost on animation this gentle.
 *
 * The frames have no backdrop: they were rendered on dark navy, and that
 * navy showed as a box against the screen behind it. Colour keying couldn't
 * remove it (Nu's shadow side is darker than the backdrop's glow), so the
 * subjects were lifted with Apple's Vision foreground segmentation — the
 * "lift subject" feature — with the thin bright details it drops (Ra's rays,
 * the check mark, papers in flight) added back by brightness, then cropped to
 * the area anything ever occupies and saved as WebP with alpha.
 */
const FRAMES = [
  require('../../assets/intro-frames/i001.webp'),
  require('../../assets/intro-frames/i002.webp'),
  require('../../assets/intro-frames/i003.webp'),
  require('../../assets/intro-frames/i004.webp'),
  require('../../assets/intro-frames/i005.webp'),
  require('../../assets/intro-frames/i006.webp'),
  require('../../assets/intro-frames/i007.webp'),
  require('../../assets/intro-frames/i008.webp'),
  require('../../assets/intro-frames/i009.webp'),
  require('../../assets/intro-frames/i010.webp'),
  require('../../assets/intro-frames/i011.webp'),
  require('../../assets/intro-frames/i012.webp'),
  require('../../assets/intro-frames/i013.webp'),
  require('../../assets/intro-frames/i014.webp'),
  require('../../assets/intro-frames/i015.webp'),
  require('../../assets/intro-frames/i016.webp'),
  require('../../assets/intro-frames/i017.webp'),
  require('../../assets/intro-frames/i018.webp'),
  require('../../assets/intro-frames/i019.webp'),
  require('../../assets/intro-frames/i020.webp'),
  require('../../assets/intro-frames/i021.webp'),
  require('../../assets/intro-frames/i022.webp'),
  require('../../assets/intro-frames/i023.webp'),
  require('../../assets/intro-frames/i024.webp'),
  require('../../assets/intro-frames/i025.webp'),
  require('../../assets/intro-frames/i026.webp'),
  require('../../assets/intro-frames/i027.webp'),
  require('../../assets/intro-frames/i028.webp'),
  require('../../assets/intro-frames/i029.webp'),
  require('../../assets/intro-frames/i030.webp'),
  require('../../assets/intro-frames/i031.webp'),
  require('../../assets/intro-frames/i032.webp'),
  require('../../assets/intro-frames/i033.webp'),
  require('../../assets/intro-frames/i034.webp'),
  require('../../assets/intro-frames/i035.webp'),
  require('../../assets/intro-frames/i036.webp'),
  require('../../assets/intro-frames/i037.webp'),
  require('../../assets/intro-frames/i038.webp'),
  require('../../assets/intro-frames/i039.webp'),
  require('../../assets/intro-frames/i040.webp'),
  require('../../assets/intro-frames/i041.webp'),
  require('../../assets/intro-frames/i042.webp'),
  require('../../assets/intro-frames/i043.webp'),
  require('../../assets/intro-frames/i044.webp'),
  require('../../assets/intro-frames/i045.webp'),
  require('../../assets/intro-frames/i046.webp'),
  require('../../assets/intro-frames/i047.webp'),
  require('../../assets/intro-frames/i048.webp'),
  require('../../assets/intro-frames/i049.webp'),
  require('../../assets/intro-frames/i050.webp'),
  require('../../assets/intro-frames/i051.webp'),
  require('../../assets/intro-frames/i052.webp'),
  require('../../assets/intro-frames/i053.webp'),
  require('../../assets/intro-frames/i054.webp'),
  require('../../assets/intro-frames/i055.webp'),
  require('../../assets/intro-frames/i056.webp'),
  require('../../assets/intro-frames/i057.webp'),
  require('../../assets/intro-frames/i058.webp'),
  require('../../assets/intro-frames/i059.webp'),
  require('../../assets/intro-frames/i060.webp'),
  require('../../assets/intro-frames/i061.webp'),
  require('../../assets/intro-frames/i062.webp'),
  require('../../assets/intro-frames/i063.webp'),
];

/**
 * Plays ONCE on arrival, then holds on its last frame. Tap to play it again.
 *
 * A five-second clip on a loop is a five-second clip you have to actively
 * ignore while you read the screen it's on — the same reason the mascots stop
 * moving after their greeting. Once is an introduction; forever is wallpaper
 * with a heartbeat.
 */
export function IntroClip({ fps = 12, style, maxWidth = 200, onStart, onEnd, overlay }: {
  fps?: number; style?: ViewStyle; maxWidth?: number;
  /** a (re)play began / the last frame is reached — Welcome times the speech bubbles off these */
  onStart?: () => void; onEnd?: () => void;
  /** drawn over the clip in its own coordinates, e.g. bubbles pointing at Nu and Ra */
  overlay?: (w: number, h: number) => React.ReactNode;
}) {
  const [i, setI] = useState(0);
  const cbs = useRef({ onStart, onEnd });
  cbs.current = { onStart, onEnd };
  const [run, setRun] = useState(0);      // bump to replay
  const ready = useRef(false);

  // A supporting beat under the slogan, not the hero — the slogan text is the
  // hero (see the doc comment on Welcome). `maxWidth` defaults to 200 so the
  // clip sits underneath the words as a small piece of motion instead of
  // competing with them; Welcome itself asks for a larger cap, since Nu and
  // Ra are the other half of the brand and were reading as an afterthought
  // at 200pt.
  //
  // useWindowDimensions, not a module-level Dimensions.get() — this also
  // renders on web (see the resolveAssetSource guard below), where the
  // window can resize after mount; a frozen constant would leave the clip
  // stuck at whatever width happened to be current on first load.
  const { width: windowWidth } = useWindowDimensions();
  const W = Math.min(windowWidth - 52, maxWidth);
  const H = W * (402 / 700);   // the cut-out frames' own aspect

  useEffect(() => {
    // Warm the decoder before the first pass, or the opening second stutters
    // while each frame is decoded on demand.
    //
    // Guarded, because Image.resolveAssetSource does not exist on
    // react-native-web — calling it unguarded threw at mount and took the
    // whole screen white. Every frame is mounted below anyway, so on web the
    // browser loads them regardless and losing this is a no-op there.
    if (!ready.current) {
      ready.current = true;
      const resolve = (Image as any).resolveAssetSource;
      if (typeof resolve === 'function') {
        FRAMES.forEach(f => {
          const src = resolve(f);
          if (src?.uri) Image.prefetch(src.uri).catch(() => {});
        });
      }
    }
    setI(0);
    cbs.current.onStart?.();
    const id = setInterval(() => {
      setI(k => {
        if (k + 1 >= FRAMES.length) { clearInterval(id); return FRAMES.length - 1; }
        return k + 1;
      });
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [fps, run]);

  // the last frame is where the clip rests — tell whoever is waiting on it
  useEffect(() => { if (i === FRAMES.length - 1) cbs.current.onEnd?.(); }, [i]);

  return (
    <Pressable onPress={() => setRun(r => r + 1)} style={[{ width: W, height: H }, style]}>
      {/* Every frame is mounted and stacked, with only the current one
          visible. Swapping a single Image's `source` makes iOS drop the old
          texture and decode the next one inline, which shows up as a flash on
          the frames it can't decode in an 83ms budget. */}
      {FRAMES.map((f, k) => (
        <Image
          key={k} source={f} resizeMode="contain"
          style={{ position: 'absolute', width: W, height: H, opacity: k === i ? 1 : 0 }}
        />
      ))}
      {overlay?.(W, H)}
    </Pressable>
  );
}
