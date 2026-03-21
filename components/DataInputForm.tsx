import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Image } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Linking } from 'react-native';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { MapPin, Phone, Mail, Instagram, Linkedin, Globe } from 'lucide-react-native'; // Ensure correct imports

const DataInputForm = () => {
  const [type, setType] = useState('');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [iconName, setIconName] = useState('');
  const [favicon, setFavicon] = useState('');
  const [iconSuggestions, setIconSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (type === 'Web Personal' && value) {
      const domain = new URL(value).hostname;
      setFavicon(`https://www.google.com/s2/favicons?domain=${domain}`);
    } else if (type === 'Ubicación' && (value.includes('google.com/maps') || value.includes('maps.app.goo.gl'))) {
      setIconName('map-pin'); // Default map icon
    }

    // Update icon suggestions based on type
    switch (type) {
      case 'Social':
        setIconSuggestions(['facebook', 'instagram', 'twitter', 'linkedin', 'snapchat', 'tiktok', 'youtube', 'pinterest', 'reddit', 'whatsapp']);
        break;
      case 'Contacto':
        setIconSuggestions(['phone', 'mail', 'message-circle', 'user', 'address-book', 'contact', 'call', 'chat', 'envelope', 'mobile']);
        break;
      case 'Links':
        setIconSuggestions(['link', 'external-link', 'globe', 'bookmark', 'chain', 'paperclip', 'attachment', 'hyperlink', 'web', 'world']);
        break;
      case 'Ubicación':
        setIconSuggestions(['map-pin', 'map', 'location', 'compass', 'navigation', 'gps', 'pin', 'marker', 'geo', 'place']);
        break;
      default:
        setIconSuggestions([]);
    }
  }, [type, value]);

  const handleSave = async () => {
    if (!type || !label || !value) {
      Alert.alert('Error', 'Todos los campos son obligatorios.');
      return;
    }

    try {
      const vaultRef = collection(db, 'vault');
      await addDoc(vaultRef, {
        type,
        label,
        value,
        iconName: iconName || favicon, // Save user-selected or default icon
      });
      Alert.alert('Éxito', 'Dato guardado correctamente.');
      setType('');
      setLabel('');
      setValue('');
      setIconName('');
      setFavicon('');
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar el dato.');
      console.error(error);
    }
  };

  const handleOpen = () => {
    switch (type) {
      case 'WhatsApp':
        Linking.openURL(`https://wa.me/${value}`);
        break;
      case 'Instagram':
        Linking.openURL(`instagram://user?username=${value}`).catch(() => {
          Linking.openURL(`https://instagram.com/${value}`);
        });
        break;
      case 'LinkedIn':
        Linking.openURL(value);
        break;
      case 'Teléfono':
        Alert.alert(
          'Ghost-Link requerido',
          'Las llamadas se inician solo con Ghost-Link VoIP dentro de Card-Social. La app de telefono nativa esta bloqueada.'
        );
        break;
      case 'Email':
        Linking.openURL(`mailto:${value}`);
        break;
      case 'Web Personal':
        Linking.openURL(value);
        break;
      case 'Ubicación':
        Linking.openURL(value);
        break;
      default:
        Alert.alert('Error', 'Tipo de dato no soportado.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Tipo de Dato</Text>
      <Picker
        selectedValue={type}
        onValueChange={(itemValue: string) => setType(itemValue)}
        style={styles.input}
      >
        <Picker.Item label="Selecciona un tipo" value="" />
        <Picker.Item label="WhatsApp" value="WhatsApp" />
        <Picker.Item label="Instagram" value="Instagram" />
        <Picker.Item label="LinkedIn" value="LinkedIn" />
        <Picker.Item label="Teléfono" value="Teléfono" />
        <Picker.Item label="Email" value="Email" />
        <Picker.Item label="Web Personal" value="Web Personal" />
        <Picker.Item label="Ubicación" value="Ubicación" />
      </Picker>

      <Text style={styles.label}>Etiqueta</Text>
      <TextInput
        style={styles.input}
        value={label}
        onChangeText={setLabel}
        placeholder="Ej: Mi WhatsApp"
      />

      <Text style={styles.label}>Valor</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder="Ej: 521234567890"
      />

      {favicon ? (
        <Image source={{ uri: favicon }} style={styles.favicon} />
      ) : null}

      <Text style={styles.label}>Selecciona un Icono</Text>
      <View style={styles.iconContainer}>
        {iconSuggestions.map((icon) => {
          const IconComponent = iconComponents[icon];
          return (
            IconComponent && (
              <IconComponent
                key={icon}
                size={24}
                color={icon === iconName ? '#1EA7FF' : '#ccc'}
                onPress={() => setIconName(icon)}
              />
            )
          );
        })}
      </View>

      <Button title="Guardar" onPress={handleSave} />
      <Button title="Abrir" onPress={handleOpen} />
    </View>
  );
};

const iconComponents: { [key: string]: React.FC<any> } = {
  'map-pin': MapPin,
  phone: Phone,
  mail: Mail,
  instagram: Instagram,
  linkedin: Linkedin,
  globe: Globe,
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
  },
  favicon: {
    width: 32,
    height: 32,
    marginBottom: 16,
  },
  iconContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
});

export default DataInputForm;
