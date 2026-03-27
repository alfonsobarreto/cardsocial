import { Picker } from '@react-native-picker/picker';
import { addDoc, collection } from 'firebase/firestore';
import { Globe, Instagram, Linkedin, Mail, MapPin, Phone } from 'lucide-react-native'; // Ensure correct imports
import React, { useEffect, useState } from 'react';
import { Alert, Button, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionController } from '../services/ActionController';
import { db } from '../services/firebaseConfig';

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
    if (type === 'Email') {
      ActionController.ActionEmail({ value });
    } else if (type === 'Teléfono') {
      ActionController.ActionTelefono({ value, userName: label || 'este contacto' });
    } else if (type === 'Links' || type === 'Web Personal' || type === 'Enlaces') {
      ActionController.ActionLink({ value, title: label });
    } else if (type === 'Documento') {
      ActionController.ActionDocument({ value });
    } else if (type === 'Texto' || type === 'Texto Plain') {
      ActionController.ActionText({ value, title: label });
    } else {
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
