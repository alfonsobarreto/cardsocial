import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

export default function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Seguridad y Privacidad */}
      <Section title="Seguridad y Privacidad">
        <TouchableOpacity style={styles.item} onPress={() => Alert.alert('Proximamente', 'Esta funcion estara disponible pronto.') }>
          <MaterialCommunityIcons name="lock-outline" size={20} color="#0D4D8A" />
          <Text style={styles.itemText}>Bloqueo de App</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.item} onPress={() => Alert.alert('Proximamente', 'Esta funcion estara disponible pronto.') }>
          <MaterialCommunityIcons name="account-multiple-outline" size={20} color="#0D4D8A" />
          <Text style={styles.itemText}>Sesiones Activas</Text>
        </TouchableOpacity>
      </Section>

      {/* Preferencias */}
      <Section title="Preferencias">
        <TouchableOpacity style={styles.item} onPress={() => Alert.alert('Proximamente', 'Esta funcion estara disponible pronto.') }>
          <MaterialCommunityIcons name="bell-outline" size={20} color="#0D4D8A" />
          <Text style={styles.itemText}>Notificaciones</Text>
        </TouchableOpacity>
      </Section>

      {/* Datos */}
      <Section title="Datos">
        <TouchableOpacity style={styles.item} onPress={() => Alert.alert('Proximamente', 'Esta funcion estara disponible pronto.') }>
          <MaterialCommunityIcons name="export-variant" size={20} color="#0D4D8A" />
          <Text style={styles.itemText}>Exportar mi informacion</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.item} onPress={() => Alert.alert('Proximamente', 'Esta funcion estara disponible pronto.') }>
          <MaterialCommunityIcons name="delete-outline" size={20} color="#0D4D8A" />
          <Text style={styles.itemText}>Limpiar Cache</Text>
        </TouchableOpacity>
      </Section>

      {/* Soporte y Legal */}
      <Section title="Soporte y Legal">
        <TouchableOpacity style={styles.item} onPress={() => Alert.alert('Proximamente', 'Esta funcion estara disponible pronto.') }>
          <MaterialCommunityIcons name="lifebuoy" size={20} color="#0D4D8A" />
          <Text style={styles.itemText}>Soporte</Text>
        </TouchableOpacity>
      </Section>

      {/* Version */}
      <View style={styles.versionBox}>
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#F8F9FA',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D4D8A',
    marginBottom: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FFF',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  itemText: {
    marginLeft: 12,
    fontSize: 15,
    color: '#222',
  },
  versionBox: {
    marginTop: 32,
    alignItems: 'center',
  },
  versionText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
});
