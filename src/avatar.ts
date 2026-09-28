import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from './db';
import type { CharacterName } from './ui';

/**
 * Your picture, kept with the profile as one string (profile.avatar):
 *
 *   ''               not chosen: the account's photo when there is one (Google
 *                    sign in), otherwise Ra, as the You tab has always shown
 *   'pose:ra-hello'  one of Nu and Ra's poses
 *   'initials'       the first letters of your name
 *   'photo:<x>'      a photo from your library: a file name in the app's
 *                    documents on the phone (the path to that folder can move
 *                    with an update, so only the name is kept), a small data
 *                    URI on the web
 *
 * Local, like the rest of the profile. Nothing is uploaded.
 */

/** The poses offered as a picture: the ones that read in a small circle. */
export const AVATAR_POSES: readonly CharacterName[] = [
  'ra-icon', 'ra-hello', 'ra-sun', 'ra-rest',
  'nu-hello', 'nu-listen', 'nu-hold', 'nu-thinking',
];

export type Look =
  | { kind: 'photo'; uri: string }
  | { kind: 'pose'; pose: CharacterName }
  | { kind: 'initials'; text: string };

export const DEFAULT_LOOK: Look = { kind: 'pose', pose: 'ra-icon' };

/** "Kim" → K, "Kim Appeltans" → KA */
export function initialsOf(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
}

/** The photo on the signed in account (Google puts one there; Apple and email don't). */
export function accountPhoto(session: Session | null): string | null {
  const meta = session?.user.user_metadata;
  const url = meta?.avatar_url ?? meta?.picture;
  return typeof url === 'string' && url ? url : null;
}

/** What to draw for this profile. */
export function lookFor(profile: Profile, session: Session | null): Look {
  const v = profile.avatar;
  if (v.startsWith('photo:')) {
    const uri = photoUri(v.slice(6));
    if (uri) return { kind: 'photo', uri };
  }
  if (v.startsWith('pose:')) {
    const pose = v.slice(5) as CharacterName;
    if (AVATAR_POSES.includes(pose)) return { kind: 'pose', pose };
  }
  if (v === 'initials') {
    const text = initialsOf(profile.name);
    if (text) return { kind: 'initials', text };
  }
  const url = accountPhoto(session);
  return url ? { kind: 'photo', uri: url } : DEFAULT_LOOK;
}

function photoUri(stored: string): string | null {
  if (/^(data|https?|file|blob):/.test(stored)) return stored;
  if (Platform.OS === 'web') return null;
  try { return new File(Paths.document, stored).uri; } catch { return null; }
}

/**
 * Choose a photo from the library, cropped square. Resolves to the value to
 * store, or null when nothing was picked. No permission to ask for: the
 * system picker hands over only the one photo.
 */
export async function pickPhoto(): Promise<string | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
  const asset = r.canceled ? null : r.assets?.[0];
  if (!asset) return null;
  if (Platform.OS === 'web') return `photo:${await shrinkOnWeb(asset.uri)}`;
  // the picker's copy sits in the cache, which the phone may clear: keep our own
  const ext = /\.(png|jpe?g|heic|webp)$/i.exec(asset.uri)?.[1]?.toLowerCase() ?? 'jpg';
  const name = `avatar-${Date.now()}.${ext}`;
  await new File(asset.uri).copy(new File(Paths.document, name));
  return `photo:${name}`;
}

/** Let go of a photo that's no longer the picture (the file on the phone; on the web it lived in the string). */
export function forgetPhoto(stored: string) {
  if (Platform.OS === 'web' || !stored.startsWith('photo:')) return;
  const name = stored.slice(6);
  if (/^(data|https?|file|blob):/.test(name)) return;
  try {
    const f = new File(Paths.document, name);
    if (f.exists) f.delete();
  } catch { /* already gone */ }
}

/**
 * The web has no cropper and hands back the whole file, so draw its middle
 * square into a small canvas: a few tens of KB to keep, not megabytes.
 */
function shrinkOnWeb(src: string, px = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.min(px, side);
      canvas.getContext('2d')?.drawImage(img,
        (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
        0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => reject(new Error('This photo could not be read'));
    img.src = src;
  });
}

/** Every photo this phone kept (clearDevice in account.ts): the next person starts without one. */
export function forgetPhotos() {
  try {
    for (const f of new Directory(Paths.document).list()) {
      if (f instanceof File && /^avatar-/.test(f.name)) f.delete();
    }
  } catch { /* nothing to clear */ }
}
