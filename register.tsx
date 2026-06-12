import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';

export default function RegisterScreen() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const router = useRouter();

  const handleSendCode = async () => {
    if (!name || !phoneNumber) {
      Alert.alert(tr('Error', 'Error'), tr('Por favor, complete todos los campos.', 'Please fill in all fields.'));
      return;
    }

    try {
      const ghostLink = name.toLowerCase().replace(/\s+/g, '-');

      await setDoc(doc(db, 'users', phoneNumber), {
        name: name,
        phone: phoneNumber,
        ghostLink: ghostLink,
        createdAt: new Date(),
      });

      Alert.alert(
        tr('Registro exitoso', 'Registration successful'),
        tr('Usuario guardado correctamente.', 'User saved successfully.'),
      );
      router.replace('/(tabs)/cards');
    } catch (error) {
      Alert.alert(
        tr('Error', 'Error'),
        tr('No se pudo guardar el usuario. Intente nuevamente.', 'Could not save the user. Please try again.'),
      );
      console.error('Firestore error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{tr('Registrar mi identidad', 'Register my identity')}</Text>
      <TextInput
        style={styles.input}
        placeholder={tr('Nombre completo', 'Full name')}
        placeholderTextColor="#8E8E93"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder={tr('Correo electrónico', 'Email')}
        placeholderTextColor="#8E8E93"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={tr('Teléfono', 'Phone')}
        placeholderTextColor="#8E8E93"
        keyboardType="phone-pad"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
      />
      <TouchableOpacity style={styles.registerButton} onPress={handleSendCode}>
        <Text style={styles.registerButtonText}>{tr('Enviar código', 'Send code')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070226', // Azul Marino
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    color: '#070226',
  },
  registerButton: {
    backgroundColor: '#1EA7FF', // Dorado Soft
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});