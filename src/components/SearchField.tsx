import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { Surface, IconSearch } from '../ui';

/** The search field a top bar turns into: type to search, Cancel to close. */
export function SearchField({ value, onChange, onCancel }: {
  value: string; onChange: (q: string) => void; onCancel: () => void;
}) {
  const t = useTheme();
  return (
    <Surface style={{ flex: 1 }} raised={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
        <IconSearch size={18} color={t.ink2} />
        <TextInput autoFocus value={value} onChangeText={onChange} placeholder="Search everything" placeholderTextColor={t.ink3}
          style={{ flex: 1, paddingVertical: 12, paddingLeft: 9, color: t.ink, fontSize: 15.5 }} />
        <Pressable onPress={() => { onChange(''); onCancel(); }} hitSlop={10} accessibilityRole="button">
          <Text style={{ color: t.nu, fontSize: 14.5, fontFamily: T.brand }}>Cancel</Text>
        </Pressable>
      </View>
    </Surface>
  );
}

/** The search bar that sits in a room's scroll, always there: type to search. */
export function SearchBar({ value, onChange, placeholder = 'Search' }: {
  value: string; onChange: (q: string) => void; placeholder?: string;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 14,
      borderWidth: 1, borderColor: focused ? t.nu : t.stroke, backgroundColor: t.layer, paddingHorizontal: 12, marginBottom: 12,
    }}>
      <IconSearch size={16} color={t.ink3} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.ink3}
        returnKeyType="search" accessibilityLabel={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ flex: 1, color: t.ink, fontSize: 15, paddingVertical: 0 }} />
      {!!value && (
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel="Clear search">
          <Text style={{ color: t.ink3, fontSize: 14 }}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}
