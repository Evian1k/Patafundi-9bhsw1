import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/LoginScreen';
import { FundiRegisterScreen } from '../screens/FundiRegisterScreen';
import { FundiOtpScreen } from '../screens/FundiOtpScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  Otp: { email: string; devOtp?: string };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator(): JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={FundiRegisterScreen} />
      <Stack.Screen name="Otp" component={FundiOtpScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
