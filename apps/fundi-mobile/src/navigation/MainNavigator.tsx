import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, LegalPageScreen } from '@patafundi/shared';
import { DashboardScreen } from '../screens/DashboardScreen';
import { JobsScreen } from '../screens/JobsScreen';
import { JobDetailScreen } from '../screens/JobDetailScreen';
import { JobChatScreen } from '../screens/JobChatScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { RequestPayoutScreen } from '../screens/RequestPayoutScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { PortfolioScreen } from '../screens/PortfolioScreen';
import { AvailabilityScreen } from '../screens/AvailabilityScreen';
import { ReviewsScreen } from '../screens/ReviewsScreen';
import { EarningsScreen } from '../screens/EarningsScreen';
import { VerificationScreen } from '../screens/VerificationScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { FundiHelpCenterScreen } from '../screens/FundiHelpCenterScreen';
import { FundiAboutScreen } from '../screens/FundiAboutScreen';
import { FundiTrustCenterScreen } from '../screens/FundiTrustCenterScreen';
import { FundiSafetyPromiseScreen } from '../screens/FundiSafetyPromiseScreen';
import { FundiEmergencySosScreen } from '../screens/FundiEmergencySosScreen';

export type DashboardStackParamList = {
  Dashboard: undefined;
  JobDetail: { jobId: string };
  JobChat: { jobId: string };
};

export type JobsStackParamList = {
  Jobs: undefined;
  JobDetail: { jobId: string };
  JobChat: { jobId: string };
};

export type WalletStackParamList = {
  Wallet: undefined;
  RequestPayout: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  Portfolio: undefined;
  Availability: undefined;
  Reviews: undefined;
  Earnings: undefined;
  Verification: undefined;
  Settings: undefined;
  HelpCenter: undefined;
  About: undefined;
  LegalPage: { slug: string; title: string };
  FundiTrustCenter: undefined;
  FundiSafetyPromise: undefined;
  FundiEmergencySos: undefined;
};

export type MainTabParamList = {
  DashboardTab: undefined;
  JobsTab: undefined;
  WalletTab: undefined;
  ProfileTab: undefined;
};

const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const JobsStack = createNativeStackNavigator<JobsStackParamList>();
const WalletStack = createNativeStackNavigator<WalletStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function DashboardStackScreen(): JSX.Element {
  return (
    <DashboardStack.Navigator>
      <DashboardStack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
      <DashboardStack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job' }} />
      <DashboardStack.Screen name="JobChat" component={JobChatScreen} options={{ title: 'Chat' }} />
    </DashboardStack.Navigator>
  );
}

function JobsStackScreen(): JSX.Element {
  return (
    <JobsStack.Navigator>
      <JobsStack.Screen name="Jobs" component={JobsScreen} options={{ headerShown: false }} />
      <JobsStack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job' }} />
      <JobsStack.Screen name="JobChat" component={JobChatScreen} options={{ title: 'Chat' }} />
    </JobsStack.Navigator>
  );
}

function WalletStackScreen(): JSX.Element {
  return (
    <WalletStack.Navigator>
      <WalletStack.Screen name="Wallet" component={WalletScreen} options={{ headerShown: false }} />
      <WalletStack.Screen name="RequestPayout" component={RequestPayoutScreen} options={{ title: 'Withdraw' }} />
    </WalletStack.Navigator>
  );
}

function ProfileStackScreen(): JSX.Element {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <ProfileStack.Screen name="Portfolio" component={PortfolioScreen} options={{ title: 'Portfolio' }} />
      <ProfileStack.Screen name="Availability" component={AvailabilityScreen} options={{ title: 'Availability' }} />
      <ProfileStack.Screen name="Reviews" component={ReviewsScreen} options={{ title: 'Reviews' }} />
      <ProfileStack.Screen name="Earnings" component={EarningsScreen} options={{ title: 'Earnings' }} />
      <ProfileStack.Screen name="Verification" component={VerificationScreen} options={{ title: 'Verification' }} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <ProfileStack.Screen name="HelpCenter" component={FundiHelpCenterScreen} options={{ title: 'Help Center' }} />
      <ProfileStack.Screen name="About" component={FundiAboutScreen} options={{ title: 'About' }} />
      <ProfileStack.Screen
        name="LegalPage"
        component={LegalPageScreen}
        options={({ route }) => ({ title: (route.params as { title?: string } | undefined)?.title ?? 'Legal' })}
      />
      <ProfileStack.Screen name="FundiTrustCenter" component={FundiTrustCenterScreen} options={{ title: 'Trust & Safety' }} />
      <ProfileStack.Screen name="FundiSafetyPromise" component={FundiSafetyPromiseScreen} options={{ title: 'Safety Promise' }} />
      <ProfileStack.Screen name="FundiEmergencySos" component={FundiEmergencySosScreen} options={{ title: 'Emergency SOS' }} />
    </ProfileStack.Navigator>
  );
}

export function MainNavigator(): JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.card,
          height: 60,
          borderTopColor: colors.border,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: fonts.sans, fontSize: 11 },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardStackScreen}
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="speedometer" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="JobsTab"
        component={JobsStackScreen}
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="WalletTab"
        component={WalletStackScreen}
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
