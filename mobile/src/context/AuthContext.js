import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { login as apiLogin, register as apiRegister, getMe } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) {
          const res = await getMe();
          setUser(res.data.user);
        }
      } catch (_) {
        await SecureStore.deleteItemAsync('token');
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const login = async (email, password) => {
    const res = await apiLogin(email, password);
    await SecureStore.setItemAsync('token', res.data.token);
    setUser(res.data.user);
  };

  const register = async (name, email, password) => {
    const res = await apiRegister(name, email, password);
    await SecureStore.setItemAsync('token', res.data.token);
    setUser(res.data.user);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
