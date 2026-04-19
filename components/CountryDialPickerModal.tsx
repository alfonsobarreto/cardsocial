import { COUNTRY_DIAL_REST, COUNTRY_DIAL_TOP, type CountryDialEntry, filterDialEntries } from '@/constants/countryDialCodes';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (entry: CountryDialEntry) => void;
  /** Título del modal (ya traducido). */
  title: string;
  /** Etiqueta sección superior (Top / Sugeridos). */
  topSectionTitle: string;
  /** Etiqueta sección resto. */
  restSectionTitle: string;
  /** Placeholder del buscador. */
  searchPlaceholder: string;
  surfaceBg: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  inputBg: string;
};

export default function CountryDialPickerModal({
  visible,
  onClose,
  onSelect,
  title,
  topSectionTitle,
  restSectionTitle,
  searchPlaceholder,
  surfaceBg,
  textPrimary,
  textSecondary,
  border,
  inputBg,
}: Props) {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const top = filterDialEntries(COUNTRY_DIAL_TOP, query);
    const rest = filterDialEntries(COUNTRY_DIAL_REST, query);
    const out: { title: string; data: CountryDialEntry[] }[] = [];
    if (top.length > 0) out.push({ title: topSectionTitle, data: top });
    if (rest.length > 0) out.push({ title: restSectionTitle, data: rest });
    return out;
  }, [query, topSectionTitle, restSectionTitle]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: surfaceBg, borderTopColor: border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: textPrimary }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialCommunityIcons name="close" color={textPrimary} size={24} />
            </TouchableOpacity>
          </View>
          <View style={[styles.searchWrap, { backgroundColor: inputBg, borderColor: border }]}>
            <MaterialCommunityIcons name="magnify" size={20} color={textSecondary} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: textPrimary }]}
              placeholder={searchPlaceholder}
              placeholderTextColor={textSecondary}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderSectionHeader={({ section: { title: st } }) => (
              <Text style={[styles.sectionHeader, { color: textSecondary }]}>{st}</Text>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  onSelect(item);
                  setQuery('');
                  onClose();
                }}
              >
                <Text style={[styles.rowText, { color: textPrimary }]}>
                  {item.code} {item.country}
                </Text>
              </TouchableOpacity>
            )}
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[styles.empty, { color: textSecondary }]}>—</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 4 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowText: { fontSize: 16 },
  empty: { textAlign: 'center', padding: 24 },
});
