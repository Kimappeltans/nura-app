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
