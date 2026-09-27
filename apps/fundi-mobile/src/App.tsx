import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './navigation/RootNavigator';
import { useAuthStore } from './store/authStore';
import { usePushNotifications } from './hooks/usePushNotifications';

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  usePushNotifications();

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
