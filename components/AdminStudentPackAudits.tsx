import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getStudentPackGrantAudits, type StudentPackGrantAudit } from '@/services/studentPackAdminService';

const AdminStudentPackAudits: React.FC = () => {
  const [rows, setRows] = useState<StudentPackGrantAudit[]>([]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const data = await getStudentPackGrantAudits(120);
    setRows(data);
  };

  const totals = useMemo(() => {
    const grants = rows.filter((r) => r.granted);
    return {
      grants: grants.length,
      credited: grants.reduce((sum, item) => sum + item.amount, 0),
      github: grants.filter((g) => g.provider === 'github.com').length,
      google: grants.filter((g) => g.provider === 'google.com').length,
    };
  }, [rows]);

  return (
    <View>
      <Text style={styles.title}>Student Pack Grants</Text>
      <Text style={styles.subtitle}>Auditoría de elegibilidad .edu y créditos otorgados.</Text>

      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Grants</Text>
          <Text style={styles.kpiValue}>{totals.grants}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>CS Entregados</Text>
          <Text style={styles.kpiValue}>{totals.credited}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>GitHub/Google</Text>
          <Text style={styles.kpiValue}>{totals.github}/{totals.google}</Text>
        </View>
      </View>

      {rows.length === 0 ? (
        <Text style={styles.empty}>No hay grants registrados.</Text>
      ) : (
        rows.map((item) => (
          <View key={item.uid} style={styles.row}>
            <MaterialCommunityIcons name="school-outline" size={16} color="#0A2540" />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.emailLower || item.uid}</Text>
              <Text style={styles.rowMeta}>{item.provider} · {item.source} · {item.grantedAtText}</Text>
            </View>
            <Text style={styles.amount}>+{item.amount} CS</Text>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A2540',
    marginBottom: 4,
  },
  subtitle: {
    color: '#666',
    marginBottom: 12,
    fontSize: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 10,
  },
  kpiLabel: {
    fontSize: 10,
    color: '#666',
  },
  kpiValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: '#0A2540',
  },
  empty: {
    fontSize: 13,
    color: '#999',
    paddingVertical: 16,
  },
  row: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E6E6E6',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0A2540',
  },
  rowMeta: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  amount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2ECC71',
  },
});

export default AdminStudentPackAudits;
