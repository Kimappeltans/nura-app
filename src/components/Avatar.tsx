import { useMemo, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { type as T } from '../theme';
import { poseImage, IconPencil, IconPhoto, IconCheck } from '../ui';
import { notify } from '../notify';
import { AVATAR_POSES, DEFAULT_LOOK, accountPhoto, forgetPhoto, initialsOf, lookFor, pickPhoto, type Look } from '../avatar';

/**
 * Your picture, in a circle: the You tab (22), the top of More, and Profile.
 * Reads the profile unless it's given a `look` to show (the picker's rows).
 * `ring` is the You tab while More is open; `edge` a hairline, for the big ones.
 */
export function Avatar({ size, ring, edge, look }: { size: number; ring?: boolean; edge?: boolean; look?: Look }) {
  const t = useTheme();
  const profile = useStore(s => s.profile);
  const session = useStore(s => s.session);
  const mine = useMemo(() => lookFor(profile, session), [profile, session]);
  // a photo that won't load (a file gone, no connection for the account's) shows Ra instead
  const [broken, setBroken] = useState<string | null>(null);
  const given = look ?? mine;
  const l = given.kind === 'photo' && given.uri === broken ? DEFAULT_LOOK : given;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center', backgroundColor: t.layer,
      borderWidth: ring ? 1.5 : edge ? 1 : 0, borderColor: ring ? t.ink : t.strokeStrong,
    }}>
      {l.kind === 'photo' ? (
        <Image source={{ uri: l.uri }} onError={() => setBroken(l.uri)} resizeMode="cover" style={{ width: size, height: size }} />
      ) : l.kind === 'pose' ? (
        <Image source={poseImage(l.pose)} resizeMode="contain" style={{ width: size, height: size }} />
      ) : (
        <Text style={{ color: t.ink, fontSize: size * 0.4, fontFamily: T.display, letterSpacing: -size * 0.015 }}>{l.text}</Text>
      )}
    </View>
  );
}

/** The picture with a pencil on its edge: tap to change it. */
export function AvatarButton({ size, onPress }: { size: number; onPress: () => void }) {
  const t = useTheme();
  const b = Math.round(size * 0.3);
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} hitSlop={6}
      accessibilityRole="button" accessibilityLabel="Change your picture"
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Avatar size={size} edge />
      <View style={{
        position: 'absolute', right: 0, bottom: 0, width: b, height: b, borderRadius: b / 2,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: t.card, borderWidth: 1, borderColor: t.strokeStrong,
      }}>
        <IconPencil size={Math.round(b * 0.52)} color={t.ink} />
      </View>
    </Pressable>
  );
}

/**
 * Choosing the picture: a photo from your library, the account's photo, your
 * initials, or one of Nu and Ra. The picture at the top changes as you pick,
 * so there's nothing to save. Lives inside a sheet (More, and Profile's).
 */
export function AvatarPicker() {
  const t = useTheme();
  const profile = useStore(s => s.profile);
  const session = useStore(s => s.session);
  const saveProfile = useStore(s => s.saveProfile);
  const [picking, setPicking] = useState(false);
  const shown = lookFor(profile, session);
  const account = accountPhoto(session);
  const initials = initialsOf(profile.name);

  const choose = async (avatar: string) => {
    const was = profile.avatar;
    if (avatar === was) return;
    Haptics.selectionAsync();
    await saveProfile({ avatar });
    forgetPhoto(was);
  };
  const photo = async () => {
    setPicking(true);
    try {
      const v = await pickPhoto();
      if (v) await choose(v);
    } catch {
      notify('Couldn’t use that photo', 'Try another one.');
    } finally {
      setPicking(false);
    }
  };

  const Choice = ({ glyph, label, on, onPress, last }: { glyph: React.ReactNode; label: string; on?: boolean; onPress: () => void; last?: boolean }) => (
    <Pressable onPress={onPress} disabled={picking} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={({ pressed }) => ({
        minHeight: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: t.stroke, backgroundColor: pressed ? t.subtle : 'transparent',
      })}>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.nuWash }}>{glyph}</View>
      <Text style={{ flex: 1, color: t.ink, fontSize: 15.5 }}>{label}</Text>
      {on && <IconCheck size={18} color={t.ink} />}
    </Pressable>
  );

  return (
    <View style={{ gap: 18 }}>
      <View style={{ alignItems: 'center' }}><Avatar size={120} edge /></View>

      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, overflow: 'hidden' }}>
        <Choice glyph={<IconPhoto size={18} color={t.ink} />} label={picking ? 'Opening your photos…' : 'Choose a photo'}
          onPress={photo} last={!account && !initials} />
        {!!account && (
          <Choice glyph={<Avatar size={32} look={{ kind: 'photo', uri: account }} />} label="Account photo"
            on={profile.avatar === ''} onPress={() => choose('')} last={!initials} />
        )}
        {!!initials && (
          <Choice glyph={<Avatar size={32} look={{ kind: 'initials', text: initials }} />} label="Initials"
            on={shown.kind === 'initials'} onPress={() => choose('initials')} last />
        )}
      </View>

      <View>
        <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginBottom: 10, marginLeft: 4 }}>NU AND RA</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 }}>
          {AVATAR_POSES.map(pose => {
            const on = shown.kind === 'pose' && shown.pose === pose;
            return (
              <Pressable key={pose} onPress={() => choose(pose === 'ra-icon' && !account ? '' : `pose:${pose}`)}
                accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={pose.startsWith('nu') ? 'Nu' : 'Ra'}
                style={({ pressed }) => ({
                  width: '22%', aspectRatio: 1, borderRadius: 999, overflow: 'hidden',
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: pressed ? t.subtle : t.card,
                  borderWidth: on ? 2 : 1, borderColor: on ? t.ink : t.stroke,
                })}>
                <Image source={poseImage(pose)} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {profile.avatar.startsWith('photo:') && (
        <Pressable onPress={() => choose('')} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 4 }}>
          <Text style={{ color: t.ink2, fontSize: 14.5 }}>Remove photo</Text>
        </Pressable>
      )}
    </View>
  );
}
