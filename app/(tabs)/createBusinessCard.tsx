
import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function CreateBusinessCardScreen() {
  // [CUARENTENA] Pantalla de business card deshabilitada temporalmente
  // Todo el código de lógica y formularios ha sido removido por cuarentena.
  // Solo se muestra el mensaje de cuarentena.
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
      <MaterialCommunityIcons name="shield-lock-outline" size={58} color="#0A2540" />
      <Text style={{ fontSize: 22, fontWeight: 'bold', marginTop: 18, color: '#0A2540' }}>Business Card deshabilitado</Text>
      <Text style={{ fontSize: 16, color: '#7B8794', marginTop: 8, textAlign: 'center', maxWidth: 320 }}>
        El flujo de creación y edición de tarjetas de negocio está en cuarentena temporal. Solo tarjetas personales están activas.
      </Text>
    </View>
  );
}
