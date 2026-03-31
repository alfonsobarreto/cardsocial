import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const router = useRouter();

  const handleSendCode = async () => {
    if (!name || !phoneNumber) {
      Alert.alert('Error', 'Por favor, complete todos los campos.');
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

      Alert.alert('Registro exitoso', 'Usuario guardado correctamente.');
      router.replace('/(tabs)/cards');
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar el usuario. Intente nuevamente.');
      console.error('Firestore error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Registrar mi Identidad</Text>
      <TextInput
        style={styles.input}
        placeholder="Nombre Completo"
        placeholderTextColor="#8E8E93"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Correo Electrónico"
        placeholderTextColor="#8E8E93"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Teléfono"
        placeholderTextColor="#8E8E93"
        keyboardType="phone-pad"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
      />
      <TouchableOpacity style={styles.registerButton} onPress={handleSendCode}>
        <Text style={styles.registerButtonText}>Enviar Código</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A2540', // Azul Marino
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
    color: '#0A2540',
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