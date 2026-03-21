import { useEffect } from 'react';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function Index() {
  const router = useRouter();
  const { code } = useGlobalSearchParams();

  // Manejar deep link de redención si existe
  useEffect(() => {
    if (code && typeof code === 'string') {
      // Si hay un código de redención, navegar a la página de redención
      router.push({
        pathname: '/redeem',
        params: { code },
      });
    }
  }, [code, router]);

  return (
    <LinearGradient
      colors={['#EAF7FF', '#CDEFFF', '#B8E7FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.logoWrap}>
        <Image source={require('../assets/images/CS Icon Logo.png')} style={styles.logoImage} />
        <Text style={styles.logo}>Card-Social</Text>
        <Text style={styles.tagline}>Confianza, Elegancia y Simplicidad</Text>
      </View>
      
      <TouchableOpacity 
        style={styles.registerButton} 
        onPress={() => router.push('/register')}
      >
        <Text style={styles.registerButtonText}>Registrar mi Identidad</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/signin' as never)}>
        <Text style={styles.loginText}>Ya tengo una cuenta / Iniciar Sesión</Text>
      </TouchableOpacity>

      {/* Botón temporal de prueba para saltar a la Bóveda directamente */}
      <TouchableOpacity 
        style={[styles.registerButton, { marginTop: 40, backgroundColor: 'rgba(255,255,255,0.75)' }]} 
        onPress={() => router.replace('/(tabs)/vault')}
      >
        <Text style={styles.registerButtonText}>Entrar como Invitado (Demo)</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  logo: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#0D4D8A',
    letterSpacing: 1.6,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 44,
  },
  logoImage: {
    width: 98,
    height: 98,
    borderRadius: 20,
    marginBottom: 14,
  },
  tagline: {
    marginTop: 6,
    color: '#2A6B97',
    fontSize: 12,
    letterSpacing: 0.7,
  },
  registerButton: {
    backgroundColor: '#0D4D8A',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginBottom: 20,
    width: '80%',
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loginText: {
    color: '#0D4D8A',
    fontSize: 14,
    textDecorationLine: 'underline',
    opacity: 0.8,
  },
});