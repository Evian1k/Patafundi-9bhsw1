import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './navigation/RootNavigator';
import { useAuthStore } from './store/authStore';

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  return (
    <>
      <StatusBar style="auto" />
      <RootNavigator />
    </>
  );
}
