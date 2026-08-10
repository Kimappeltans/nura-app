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
 * 12fps rather than the source's 24 halves the payload to ~1.5MB with no
 * visible cost on animation this gentle. Frames are JPEG, not PNG, because the
 * clip has an opaque background and no alpha to preserve.
 */
const FRAMES = [
  require('../../assets/intro-frames/i001.jpg'),
  require('../../assets/intro-frames/i002.jpg'),
  require('../../assets/intro-frames/i003.jpg'),
  require('../../assets/intro-frames/i004.jpg'),
  require('../../assets/intro-frames/i005.jpg'),
  require('../../assets/intro-frames/i006.jpg'),
  require('../../assets/intro-frames/i007.jpg'),
  require('../../assets/intro-frames/i008.jpg'),
  require('../../assets/intro-frames/i009.jpg'),
  require('../../assets/intro-frames/i010.jpg'),
  require('../../assets/intro-frames/i011.jpg'),
  require('../../assets/intro-frames/i012.jpg'),
  require('../../assets/intro-frames/i013.jpg'),
  require('../../assets/intro-frames/i014.jpg'),
  require('../../assets/intro-frames/i015.jpg'),
  require('../../assets/intro-frames/i016.jpg'),
  require('../../assets/intro-frames/i017.jpg'),
  require('../../assets/intro-frames/i018.jpg'),
  require('../../assets/intro-frames/i019.jpg'),
  require('../../assets/intro-frames/i020.jpg'),
  require('../../assets/intro-frames/i021.jpg'),
  require('../../assets/intro-frames/i022.jpg'),
  require('../../assets/intro-frames/i023.jpg'),
  require('../../assets/intro-frames/i024.jpg'),
  require('../../assets/intro-frames/i025.jpg'),
  require('../../assets/intro-frames/i026.jpg'),
  require('../../assets/intro-frames/i027.jpg'),
  require('../../assets/intro-frames/i028.jpg'),
  require('../../assets/intro-frames/i029.jpg'),
  require('../../assets/intro-frames/i030.jpg'),
  require('../../assets/intro-frames/i031.jpg'),
  require('../../assets/intro-frames/i032.jpg'),
  require('../../assets/intro-frames/i033.jpg'),
  require('../../assets/intro-frames/i034.jpg'),
  require('../../assets/intro-frames/i035.jpg'),
  require('../../assets/intro-frames/i036.jpg'),
  require('../../assets/intro-frames/i037.jpg'),
  require('../../assets/intro-frames/i038.jpg'),
  require('../../assets/intro-frames/i039.jpg'),
  require('../../assets/intro-frames/i040.jpg'),
  require('../../assets/intro-frames/i041.jpg'),
  require('../../assets/intro-frames/i042.jpg'),
  require('../../assets/intro-frames/i043.jpg'),
  require('../../assets/intro-frames/i044.jpg'),
  require('../../assets/intro-frames/i045.jpg'),
  require('../../assets/intro-frames/i046.jpg'),
  require('../../assets/intro-frames/i047.jpg'),
  require('../../assets/intro-frames/i048.jpg'),
  require('../../assets/intro-frames/i049.jpg'),
  require('../../assets/intro-frames/i050.jpg'),
  require('../../assets/intro-frames/i051.jpg'),
  require('../../assets/intro-frames/i052.jpg'),
  require('../../assets/intro-frames/i053.jpg'),
  require('../../assets/intro-frames/i054.jpg'),
  require('../../assets/intro-frames/i055.jpg'),
  require('../../assets/intro-frames/i056.jpg'),
  require('../../assets/intro-frames/i057.jpg'),
  require('../../assets/intro-frames/i058.jpg'),
  require('../../assets/intro-frames/i059.jpg'),
  require('../../assets/intro-frames/i060.jpg'),
  require('../../assets/intro-frames/i061.jpg'),
  require('../../assets/intro-frames/i062.jpg'),
  require('../../assets/intro-frames/i063.jpg'),
];

/**
 * Plays ONCE on arrival, then holds on its last frame. Tap to play it again.
 *
 * A five-second clip on a loop is a five-second clip you have to actively
 * ignore while you read the screen it's on — the same reason the mascots stop
 * moving after their greeting. Once is an introduction; forever is wallpaper
 * with a heartbeat.
 */
export function IntroClip({ fps = 12, style, maxWidth = 200 }: { fps?: number; style?: ViewStyle; maxWidth?: number }) {
  const [i, setI] = useState(0);
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
  const H = W * (512 / 768);

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
    const id = setInterval(() => {
      setI(k => {
        if (k + 1 >= FRAMES.length) { clearInterval(id); return FRAMES.length - 1; }
        return k + 1;
      });
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [fps, run]);

  return (
    <Pressable onPress={() => setRun(r => r + 1)} style={[{ width: W, height: H }, style]}>
      {/* Every frame is mounted and stacked, with only the current one
          visible. Swapping a single Image's `source` makes iOS drop the old
          texture and decode the next one inline, which shows up as a flash on
          the frames it can't decode in an 83ms budget. */}
      {FRAMES.map((f, k) => (
        <Image
          key={k} source={f} resizeMode="cover"
          style={{ position: 'absolute', width: W, height: H, opacity: k === i ? 1 : 0 }}
        />
      ))}
    </Pressable>
  );
}
