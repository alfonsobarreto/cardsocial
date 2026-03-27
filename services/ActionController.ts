// ActionController.ts
// Controlador central para acciones de iconos Card-Social
import * as Clipboard from 'expo-clipboard';
import { Alert, Linking, Platform } from 'react-native';

export const ActionController = {
  /**
   * ActionLink: Abre una URL. Encoda con encodeURI() y trunca la URL técnica en la UI.
   */
  async ActionLink({ value, title }: { value: string; title: string }) {
    const raw = String(value || '').trim();
    if (!raw) {
      Alert.alert('Enlace inválido', 'No hay URL para abrir.');
      return;
    }
    const url = encodeURI(raw);
    const displayUrl = url.length > 42 ? `${url.slice(0, 39)}...` : url;
    Alert.alert(
      title || 'Abrir enlace',
      displayUrl,
      [
        { text: 'Abrir', onPress: () => Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir el enlace.')) },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  },

  /**
   * ActionEmail: Deep linking para iOS con googlegmail://, ms-outlook://, ymail:// y mailto:.
   * En Android usa directamente mailto:.
   */
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
      Alert.alert(
        'Selecciona app de correo',
        email,
        [
          { text: 'Mail', onPress: () => Linking.openURL(mailto) },
          { text: 'Gmail', onPress: () => Linking.canOpenURL(gmail).then(ok => ok ? Linking.openURL(gmail) : Linking.openURL(mailto)) },
          { text: 'Outlook', onPress: () => Linking.canOpenURL(outlook).then(ok => ok ? Linking.openURL(outlook) : Linking.openURL(mailto)) },
          { text: 'Yahoo', onPress: () => Linking.canOpenURL(yahoo).then(ok => ok ? Linking.openURL(yahoo) : Linking.openURL(mailto)) },
          { text: 'Cancelar', style: 'cancel' },
        ]
      );
    } else {
      await Linking.openURL(mailto);
    }
  },

  /**
   * ActionTelefono: Modal flotante con nombre de usuario y tarjeta. NUNCA muestra el número real.
   * Botones: Llamar VoIP y Cancelar.
   */
  async ActionTelefono({
    value,
    userName = 'este contacto',
    cardName,
  }: {
    value: string;
    userName?: string;
    cardName?: string;
  }) {
    const tel = String(value || '').replace(/\s+/g, '');
    if (!/^\+?\d{7,15}$/.test(tel)) {
      Alert.alert('Teléfono inválido', 'No es un número válido para marcar.');
      return;
    }
    Alert.alert(
      `¿Deseas llamar a ${userName}?`,
      cardName ?? undefined,
      [
        {
          text: 'Llamar VoIP',
          onPress: () => Linking.openURL(`tel:${tel}`).catch(() => Alert.alert('Error', 'No se pudo iniciar la llamada.')),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  },

  /**
   * ActionText: Modal flotante con el texto completo.
   * Encabezado = Nombre del Dato (title). Botones: Copiar y Cancelar.
   */
  async ActionText({ value, title }: { value: string; title?: string }) {
    const text = String(value || '');
    Alert.alert(
      title || 'Texto',
      text,
      [
        {
          text: 'Copiar',
          onPress: async () => {
            await Clipboard.setStringAsync(text);
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  },

  /**
   * ActionDocument: Flujo asíncrono estilo WhatsApp hacia DigitalOcean.
   * Cierra el modal del frontend de INMEDIATO y deja que el backend procese en silencio.
   */
  async ActionDocument({
    value,
    closeModal,
    uploadCallback,
  }: {
    value: string;
    closeModal?: () => void;
    uploadCallback?: () => Promise<void>;
  }) {
    // Cierra el modal del frontend de inmediato — igual que WhatsApp al enviar
    closeModal?.();

    // Si hay un uploadCallback, lanza el proceso en background silenciosamente
    if (uploadCallback) {
      uploadCallback().catch(() => {
        // Error silencioso: el usuario ya no ve el modal
      });
      return;
    }

    // Si es solo visualización (sin upload), abre la URL
    const url = String(value || '').trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert('Documento', 'No se pudo abrir el documento.');
      }
      return;
    }

    Alert.alert('Documento', url || 'No hay documento disponible.');
  },

  /**
   * ActionImage: Similar to ActionDocument but for images.
   * Closes the modal immediately and processes the image upload in the background.
   */
  async ActionImage({
    value,
    closeModal,
    uploadCallback,
  }: {
    value: string;
    closeModal?: () => void;
    uploadCallback?: () => Promise<void>;
  }) {
    // Close the modal immediately
    closeModal?.();

    // Launch the upload process in the background
    if (uploadCallback) {
      setTimeout(() => {
        uploadCallback().catch(() => {
          // Silent error handling
        });
      }, 0);
      return;
    }

    // If no uploadCallback, log the value for debugging
    console.log('No uploadCallback provided for ActionImage:', value);
  },
};
