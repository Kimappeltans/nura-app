import { useCallback } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, useTheme } from '../src/store';
import { radius, type as T } from '../src/theme';

/**
 * Reachable from Nu only — this is reflection, not doing.
 * The total is monotonic: it never resets and never goes down.
 */
export default function Wins() {
  const t = useTheme();
  const { wins, total, momentum, grid, refresh } = useStore();
  useFocusEffect(useCallback(() => { refresh(); }, []));
  const step = (n: number) => t.scale[Math.min(n, t.scale.length - 1)];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <View style={{ flex: 1, padding: 18, gap: 14 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 4 }}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>← Everything</Text>
        </Pressable>

        <View>
          <Text style={{ color: t.ra, fontSize: 62, fontFamily: T.displayLight }}>{total}</Text>
          <Text style={{ color: t.ink2, fontSize: 13, marginTop: 2 }}>
            things done. This number never goes down.
          </Text>
        </View>

        <View style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 14,
          borderWidth: 1, borderColor: t.stroke }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: t.ink3, fontSize: 12 }}>Momentum</Text>
            <Text style={{ color: t.ink, fontSize: 13, fontWeight: '600' }}>
              {momentum > 0.6 ? 'Strong' : momentum > 0.25 ? 'Building back' : 'Quiet'}
            </Text>
          </View>
          {/* a decaying average, not a chain: no zero, no cliff, nothing to break */}
          <View style={{ height: 4, borderRadius: 2, backgroundColor: t.track, overflow: 'hidden' }}>
            <View style={{ height: 4, borderRadius: 2, width: `${Math.round(momentum * 100)}%`,
              backgroundColor: t.nu }} />
          </View>
        </View>

        {/* gaps read as a pattern, not as failure */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
          {grid.slice(-182).map((d, i) => (
            <View key={i} style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: step(d.n) }} />
          ))}
        </View>

        <FlatList
          data={wins} keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 10,
              borderBottomWidth: 1, borderBottomColor: t.stroke }}>
              <Text style={{ color: t.ra }}>✓</Text>
              <Text style={{ color: t.ink, fontSize: 14, flex: 1 }}>{item.title}</Text>
              <Text style={{ color: t.ink3, fontSize: 12 }}>
                {item.completed_at
                  ? new Date(item.completed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                  : ''}
              </Text>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}
