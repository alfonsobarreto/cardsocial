// ActionController.ts
// Controlador central para acciones de iconos Card-Social
import { Alert, Linking, Platform } from 'react-native';

export const ActionController = {
  async ActionLink({ value, title }: { value: string; title: string }) {
    try {
      const url = encodeURI(value);
      await Linking.openURL(url);
    } catch {
      Alert.alert('No se pudo abrir el enlace', title || '');
    }
  },

  async ActionEmail({ value }: { value: string }) {
    const email = String(value || '').trim();
    if (!email) {
      Alert.alert('Correo inválido', 'No hay un correo válido para abrir.');
      return;
    }
    const encodedEmail = encodeURIComponent(email);
    const gmail = `googlegmail://co?to=${encodedEmail}`;
    const outlook = `ms-outlook://compose?to=${encodedEmail}`;
    const yahoo = `ymail://mail/compose?to=${encodedEmail}`;
    const mailto = `mailto:${email}`;
    if (Platform.OS === 'ios') {
      Alert.alert('Selecciona app de correo', 'Elige desde qué app quieres enviar este correo.', [
        { text: 'Mail', onPress: () => Linking.openURL(mailto) },
        { text: 'Gmail', onPress: () => Linking.canOpenURL(gmail).then(ok => ok && Linking.openURL(gmail)) },
        { text: 'Outlook', onPress: () => Linking.canOpenURL(outlook).then(ok => ok && Linking.openURL(outlook)) },
        { text: 'Yahoo', onPress: () => Linking.canOpenURL(yahoo).then(ok => ok && Linking.openURL(yahoo)) },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    } else {
      Linking.openURL(mailto);
    }
  },

  async ActionTelefono({ value }: { value: string }) {
    const tel = String(value || '').replace(/\s+/g, '');
    if (!/^\+?\d{7,15}$/.test(tel)) {
      Alert.alert('Teléfono inválido', 'No es un número válido.');
      return;
    }
    await Linking.openURL(`tel:${tel}`);
  },

  async ActionText({ value }: { value: string }) {
    Alert.alert('Texto', value || '');
  },

  async ActionDocument({ value, mimeType }: { value: string; mimeType?: string }) {
    // Solo abre el documento, la carga asíncrona se maneja en el flujo de NewInfoForm
    if (mimeType && mimeType.includes('pdf')) {
      await Linking.openURL(value);
    } else if (mimeType && mimeType.startsWith('image/')) {
      await Linking.openURL(value);
    } else {
      Alert.alert('Documento', 'No se puede abrir este tipo de archivo.');
    }
  },
};
