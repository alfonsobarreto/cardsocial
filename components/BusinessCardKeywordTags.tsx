import { MAX_BUSINESS_KEYWORDS, isKeywordBlocked, validateBusinessKeywordList } from '@/services/businessKeywordValidation';
import { useCreationT } from '@/services/creationI18n';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  tags: string[];
  onTagsChange: (next: string[]) => void;
  textColor: string;
  subColor: string;
  borderColor: string;
  inputBg: string;
  chipBg: string;
};

/**
 * Hasta 20 keywords; entrada por comas o botón añadir; validación + filtro de bloqueo.
 */
export function BusinessCardKeywordTags({
  tags,
  onTagsChange,
  textColor,
  subColor,
  borderColor,
  inputBg,
  chipBg,
}: Props) {
  const tcx = useCreationT();
  const [draft, setDraft] = useState('');

  const countLabel = useMemo(
    () => `${tags.length}/${MAX_BUSINESS_KEYWORDS}`,
    [tags.length],
  );

  const tryAdd = useCallback(
    (raw: string) => {
      const part = raw.trim();
      if (!part) return;
      const pieces = part.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
      let next = [...tags];
      for (const p of pieces) {
        if (next.length >= MAX_BUSINESS_KEYWORDS) {
          Alert.alert(
            tcx('form_bc_keyword_limit_title'),
            tcx('form_bc_keyword_limit_body', { max: MAX_BUSINESS_KEYWORDS }),
          );
          break;
        }
        if (isKeywordBlocked(p)) {
          Alert.alert(
            tcx('form_bc_keyword_blocked_title'),
            tcx('form_bc_keyword_blocked_body'),
          );
          continue;
        }
        const dup = next.some((x) => x.toLowerCase() === p.toLowerCase());
        if (dup) continue;
        next = [...next, p];
      }
      const v = validateBusinessKeywordList(next);
      if (!v.ok) {
        if (v.reason === 'too_long') {
          Alert.alert(tcx('form_bc_tag_too_long_title'), tcx('form_bc_tag_too_long_body'));
        } else if (v.reason === 'too_many') {
          Alert.alert(
            tcx('create_limit_title'),
            tcx('form_bc_keyword_limit_body', { max: MAX_BUSINESS_KEYWORDS }),
          );
        }
        return;
      }
      onTagsChange(v.tags);
      setDraft('');
    },
    [onTagsChange, tags, tcx],
  );

  const removeAt = (index: number) => {
    onTagsChange(tags.filter((_, i) => i !== index));
  };

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.hint, { color: subColor }]}>{tcx('form_bc_keyword_hint')}</Text>
        <Text style={[styles.counter, { color: textColor }]}>{countLabel}</Text>
      </View>
      <View style={[styles.inputRow, { borderColor, backgroundColor: inputBg }]}>
        <TextInput
          style={[styles.input, { color: textColor }]}
          value={draft}
          onChangeText={setDraft}
          placeholder={tcx('form_bc_placeholder')}
          placeholderTextColor={subColor}
          onSubmitEditing={() => tryAdd(draft)}
          returnKeyType="done"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.addBtn, { borderColor }]}
          onPress={() => tryAdd(draft)}
          accessibilityRole="button"
          accessibilityLabel={tcx('form_bc_add_tag')}
        >
          <MaterialCommunityIcons name="plus" size={22} color={textColor} />
        </TouchableOpacity>
      </View>
      {tags.length > 0 ? (
        <View style={styles.chips}>
          {tags.map((t, i) => (
            <View key={`${t}-${i}`} style={[styles.chip, { borderColor, backgroundColor: chipBg }]}>
              <Text style={[styles.chipText, { color: textColor }]} numberOfLines={1}>
                {t}
              </Text>
              <TouchableOpacity onPress={() => removeAt(i)} hitSlop={8} accessibilityLabel={tcx('form_bc_remove')}>
                <MaterialCommunityIcons name="close-circle" size={18} color={subColor} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  hint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  counter: {
    fontSize: 12,
    fontWeight: '800',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 4,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  addBtn: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
});
