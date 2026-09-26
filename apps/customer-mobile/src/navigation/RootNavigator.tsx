import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore';
import { AuthNavigator, AuthStackParamList } from './AuthNavigator';
import { MainNavigator, MainTabParamList } from './MainNavigator';

type RootParamList = AuthStackParamList & MainTabParamList;

interface RootNavigatorProps {
  linking?: LinkingOptions<RootParamList>;
}

export function RootNavigator({ linking }: RootNavigatorProps): JSX.Element {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return (
    <NavigationContainer linking={linking as LinkingOptions<Record<string, unknown>>}>
      {isLoggedIn ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
