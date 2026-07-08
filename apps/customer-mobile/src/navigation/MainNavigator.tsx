import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '@patafundi/shared';
import { HomeScreen } from '../screens/HomeScreen';
import { CreateJobScreen } from '../screens/CreateJobScreen';
import { JobsScreen } from '../screens/JobsScreen';
import { JobTrackingScreen } from '../screens/JobTrackingScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { CreateDisputeScreen } from '../screens/CreateDisputeScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { SavedPlacesScreen } from '../screens/SavedPlacesScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { DisputesScreen } from '../screens/DisputesScreen';
import { SupportScreen } from '../screens/SupportScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { LegalPageScreen } from '../screens/LegalPageScreen';
import { HelpCenterScreen } from '../screens/HelpCenterScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import { ReferEarnScreen } from '../screens/ReferEarnScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { SecurityCenterScreen } from '../screens/SecurityCenterScreen';
import { TrustCenterScreen } from '../screens/TrustCenterScreen';
import { SafetyPromiseScreen } from '../screens/SafetyPromiseScreen';
import { VerifiedFundisScreen } from '../screens/VerifiedFundisScreen';
import { PaymentProtectionScreen } from '../screens/PaymentProtectionScreen';
import { PricingExplainedScreen } from '../screens/PricingExplainedScreen';
import { EmergencySosScreen } from '../screens/EmergencySosScreen';
import { ReferralProgramScreen } from '../screens/ReferralProgramScreen';
import { LoyaltyProgramScreen } from '../screens/LoyaltyProgramScreen';
import { ReleaseNotesScreen } from '../screens/ReleaseNotesScreen';
import { AppUpdateRequiredScreen } from '../screens/AppUpdateRequiredScreen';
import { MaintenanceModeScreen } from '../screens/MaintenanceModeScreen';
import { NoInternetScreen } from '../screens/NoInternetScreen';
import { ErrorScreen } from '../screens/ErrorScreen';
import { AccountSuspendedScreen } from '../screens/AccountSuspendedScreen';
import { AppealScreen } from '../screens/AppealScreen';

export type HomeStackParamList = {
  Home: undefined;
  CreateJob: { category?: string } | undefined;
  JobTracking: { jobId: string };
  Chat: { jobId: string };
  Review: { jobId: string };
  CreateDispute: { jobId: string };
};

export type JobsStackParamList = {
  Jobs: undefined;
  JobTracking: { jobId: string };
  Chat: { jobId: string };
  Review: { jobId: string };
  CreateDispute: { jobId: string };
};

export type WalletStackParamList = {
  Wallet: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  SavedPlaces: undefined;
  Notifications: undefined;
  Disputes: undefined;
  JobTracking: { jobId: string };
  Chat: { jobId: string };
  Review: { jobId: string };
  Support: undefined;
  Settings: undefined;
  LegalPage: { slug: string; title: string };
  HelpCenter: undefined;
  Favorites: undefined;
  ReferEarn: undefined;
  About: undefined;
  SecurityCenter: undefined;
  TrustCenter: undefined;
  SafetyPromise: undefined;
  VerifiedFundis: undefined;
  PaymentProtection: undefined;
  PricingExplained: undefined;
  EmergencySos: undefined;
  ReferralProgram: undefined;
  LoyaltyProgram: undefined;
  ReleaseNotes: undefined;
  AppUpdateRequired: { mandatory?: boolean; version?: string; message?: string } | undefined;
  MaintenanceMode: { message?: string; estimatedCompletion?: string } | undefined;
  NoInternet: undefined;
  Error: { type?: '404' | '500' | 'timeout' | 'permission' | 'generic'; message?: string; onRetry?: () => void } | undefined;
  AccountSuspended: { reason?: string; caseId?: string; nextReviewDate?: string } | undefined;
  Appeal: { caseId?: string } | undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  JobsTab: undefined;
  WalletTab: undefined;
  ProfileTab: undefined;
};

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const JobsStack = createNativeStackNavigator<JobsStackParamList>();
const WalletStack = createNativeStackNavigator<WalletStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function HomeStackScreen(): JSX.Element {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="CreateJob" component={CreateJobScreen} options={{ title: 'New Job' }} />
      <HomeStack.Screen name="JobTracking" component={JobTrackingScreen} options={{ title: 'Job' }} />
      <HomeStack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      <HomeStack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review' }} />
      <HomeStack.Screen name="CreateDispute" component={CreateDisputeScreen} options={{ title: 'Dispute' }} />
    </HomeStack.Navigator>
  );
}

function JobsStackScreen(): JSX.Element {
  return (
    <JobsStack.Navigator>
      <JobsStack.Screen name="Jobs" component={JobsScreen} options={{ headerShown: false }} />
      <JobsStack.Screen name="JobTracking" component={JobTrackingScreen} options={{ title: 'Job' }} />
      <JobsStack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      <JobsStack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review' }} />
      <JobsStack.Screen name="CreateDispute" component={CreateDisputeScreen} options={{ title: 'Dispute' }} />
    </JobsStack.Navigator>
  );
}

function WalletStackScreen(): JSX.Element {
  return (
    <WalletStack.Navigator>
      <WalletStack.Screen name="Wallet" component={WalletScreen} options={{ headerShown: false }} />
    </WalletStack.Navigator>
  );
}

function ProfileStackScreen(): JSX.Element {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <ProfileStack.Screen name="SavedPlaces" component={SavedPlacesScreen} options={{ title: 'Saved Places' }} />
      <ProfileStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <ProfileStack.Screen name="Disputes" component={DisputesScreen} options={{ title: 'Disputes' }} />
      <ProfileStack.Screen name="JobTracking" component={JobTrackingScreen} options={{ title: 'Job' }} />
      <ProfileStack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      <ProfileStack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review' }} />
      <ProfileStack.Screen name="Support" component={SupportScreen} options={{ title: 'Support' }} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <ProfileStack.Screen
        name="LegalPage"
        component={LegalPageScreen}
        options={({ route }) => ({ title: (route.params as { title?: string } | undefined)?.title ?? 'Legal' })}
      />
      <ProfileStack.Screen name="HelpCenter" component={HelpCenterScreen} options={{ title: 'Help Center' }} />
      <ProfileStack.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'Favorites' }} />
      <ProfileStack.Screen name="ReferEarn" component={ReferEarnScreen} options={{ title: 'Refer & Earn' }} />
      <ProfileStack.Screen name="About" component={AboutScreen} options={{ title: 'About' }} />
      <ProfileStack.Screen name="SecurityCenter" component={SecurityCenterScreen} options={{ title: 'Security' }} />
      <ProfileStack.Screen name="TrustCenter" component={TrustCenterScreen} options={{ title: 'Trust & Safety' }} />
      <ProfileStack.Screen name="SafetyPromise" component={SafetyPromiseScreen} options={{ title: 'Safety Promise' }} />
      <ProfileStack.Screen name="VerifiedFundis" component={VerifiedFundisScreen} options={{ title: 'Verified Fundis' }} />
      <ProfileStack.Screen name="PaymentProtection" component={PaymentProtectionScreen} options={{ title: 'Payment Protection' }} />
      <ProfileStack.Screen name="PricingExplained" component={PricingExplainedScreen} options={{ title: 'How Pricing Works' }} />
      <ProfileStack.Screen name="EmergencySos" component={EmergencySosScreen} options={{ title: 'Emergency SOS' }} />
      <ProfileStack.Screen name="ReferralProgram" component={ReferralProgramScreen} options={{ title: 'Referral Program' }} />
      <ProfileStack.Screen name="LoyaltyProgram" component={LoyaltyProgramScreen} options={{ title: 'Loyalty Program' }} />
      <ProfileStack.Screen name="ReleaseNotes" component={ReleaseNotesScreen} options={{ title: 'Release Notes' }} />
      <ProfileStack.Screen name="AppUpdateRequired" component={AppUpdateRequiredScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="MaintenanceMode" component={MaintenanceModeScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="NoInternet" component={NoInternetScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="Error" component={ErrorScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="AccountSuspended" component={AccountSuspendedScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="Appeal" component={AppealScreen} options={{ title: 'Submit Appeal' }} />
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
        name="HomeTab"
        component={HomeStackScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
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
