/**
 * ErrorBoundary — atrapa errores de render no controlados.
 * Muestra una pantalla de fallback en lugar de crashear la app.
 */

import { trAction } from '@/services/language';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>{trAction('Algo salió mal', 'Something went wrong')}</Text>
          <Text style={styles.subtitle}>{trAction('Vuelve a intentarlo.', 'Please try again.')}</Text>
          <Text style={styles.detail} numberOfLines={4}>
            {trAction('Puede deberse a un fallo temporal. Si continúa, reinicia la aplicación.', 'This may be a temporary issue. If it keeps happening, restart the app.')}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry} activeOpacity={0.8}>
            <Text style={styles.retryText}>{trAction('Reintentar', 'Try again')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1A2F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7EB5D6',
  },
  detail: {
    fontSize: 13,
    color: '#556B7A',
    textAlign: 'center',
    marginTop: 4,
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: '#7A42FF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
