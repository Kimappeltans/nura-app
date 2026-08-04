import { useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { capture, type Energy } from '../db';
import { radius, type as T, copy } from '../theme';

const ENERGIES: { key: Energy; label: string }[] = [
  { key: 'low', label: 'Low' }, { key: 'steady', label: 'Steady' }, { key: 'focused', label: 'Focused' },
];

/**
 * NU — the water.
 *
 * Everything is here and none of it is startable. There is deliberately no Begin
 * button on this screen: you are either receiving or doing, never both.
 */
export default function Nu() {
  const t = useTheme();
  const [text, setText] = useState('');
  const { inbox, energy, setEnergy, toRa, refresh, total } = useStore();

  const submit = async () => {
    if (!text.trim()) return;
    await capture(text);
    setText('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <View style={{ flex: 1, padding: 18, gap: 12 }}>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 25, fontFamily: T.display }}>{copy.captureTitle}</Text>
            <Text style={{ color: t.ink3, fontSize: 13, marginTop: 2 }}>{copy.captureSub}</Text>
          </View>
          <Pressable onPress={() => router.push('/wins')} hitSlop={10} style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: t.ra, fontSize: 22, fontFamily: T.displayLight }}>{total}</Text>
            <Text style={{ color: t.ink3, fontSize: 10.5, letterSpacing: 1 }}>DONE</Text>
          </Pressable>
        </View>

        <TextInput
          autoFocus value={text} onChangeText={setText}
          onSubmitEditing={submit} blurOnSubmit={false} returnKeyType="done"
          placeholder="library book…" placeholderTextColor={t.ink3}
          style={{
            backgroundColor: t.card, borderRadius: radius.md, borderWidth: 1,
            borderColor: t.strokeStrong, borderBottomColor: t.nu, borderBottomWidth: 2,
            paddingHorizontal: 13, paddingVertical: 14, color: t.ink, fontSize: 15.5,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Text style={{ color: t.ink3, fontSize: 12.5, flex: 1 }}>{copy.energyAsk}</Text>
          {ENERGIES.map(e => (
            <Pressable key={e.key}
              onPress={() => { Haptics.selectionAsync(); setEnergy(e.key); }}
              style={{
                paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill,
                backgroundColor: energy === e.key ? t.nu : 'transparent',
                borderWidth: 1, borderColor: energy === e.key ? t.nu : t.strokeStrong,
              }}>
              <Text style={{ color: energy === e.key ? '#fff' : t.ink2, fontSize: 12 }}>{e.label}</Text>
            </Pressable>
          ))}
        </View>

        <FlatList
          data={inbox} keyExtractor={i => i.id} keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          ListEmptyComponent={
            <Text style={{ color: t.ink3, fontSize: 14, paddingVertical: 22 }}>
              Nothing here yet. Anything counts — it doesn't have to be a task.
            </Text>}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/task/[id]', params: { id: item.id } })}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13,
                borderBottomWidth: 1, borderBottomColor: t.stroke,
                opacity: Math.max(0.4, 1 - index * 0.05),   // older fades; nothing is deleted
              }}>
              <Text style={{ color: t.ink, fontSize: 15, flex: 1 }}>{item.title}</Text>
              {!!item.est_minutes && <Text style={{ color: t.ink3, fontSize: 12 }}>{item.est_minutes}m</Text>}
              <Text style={{ color: t.ink3, fontSize: 15 }}>›</Text>
            </Pressable>
          )}
        />

        {/* the only exit from Nu, and the only way anything ever starts */}
        <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); toRa(); }}
          style={{
            backgroundColor: t.ra, borderRadius: radius.md, paddingVertical: 17,
            alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 9,
          }}>
          <Text style={{ color: '#1A1206', fontSize: 16, fontWeight: '600' }}>Find one thing</Text>
          <Text style={{ color: '#1A1206', fontSize: 16 }}>→</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
