import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PendingApprovalScreen } from '../screens/PendingApprovalScreen';

export type PendingApprovalStackParamList = {
  PendingApproval: undefined;
};

const Stack = createNativeStackNavigator<PendingApprovalStackParamList>();

export function PendingApprovalNavigator(): JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="PendingApproval">
      <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
    </Stack.Navigator>
  );
}
