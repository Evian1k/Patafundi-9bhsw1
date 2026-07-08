import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
} from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';

interface MenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const MENU: MenuItem[] = [
  { label: 'Edit Profile', icon: 'create-outline', route: 'EditProfile' },
  { label: 'Saved Places', icon: 'location-outline', route: 'SavedPlaces' },
  { label: 'Favorites', icon: 'heart-outline', route: 'Favorites' },
  { label: 'Refer & Earn', icon: 'gift-outline', route: 'ReferEarn' },
  { label: 'My Jobs', icon: 'briefcase-outline', route: 'Jobs' },
  { label: 'Disputes', icon: 'alert-circle-outline', route: 'Disputes' },
  { label: 'Notifications', icon: 'notifications-outline', route: 'Notifications' },
  { label: 'Help Center', icon: 'help-circle-outline', route: 'HelpCenter' },
  { label: 'Support', icon: 'chatbubble-ellipses-outline', route: 'Support' },
  { label: 'Security', icon: 'shield-outline', route: 'SecurityCenter' },
  { label: 'About', icon: 'information-circle-outline', route: 'About' },
  { label: 'Settings', icon: 'settings-outline', route: 'Settings' },
];

export function ProfileScreen({ navigation }: any): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const initial = (user?.fullName?.trim()?.[0] ?? 'U').toUpperCase();
  const trustScore = user?.trustScore ?? 0;

  const handleSignOut = (): void => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  const handleMenuPress = (route: string): void => {
    if (route === 'Jobs') {
      // Navigate to the Jobs tab via the parent tab navigator.
      const parent = navigation.getParent();
      parent?.navigate('JobsTab');
      return;
    }
    navigation.navigate(route);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <View style={styles.header}>
        <LinearGradient
          colors={[gradients.primary.start, gradients.primary.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </LinearGradient>
        <Text style={styles.name}>{user?.fullName ?? 'User'}</Text>
        <Text style={styles.email}>{user?.email ?? ''}</Text>
        {user?.phone ? <Text style={styles.phone}>{user.phone}</Text> : null}

        <View style={styles.trustCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
          <Text style={styles.trustLabel}>Trust Score</Text>
          <Text style={styles.trustValue}>{trustScore}</Text>
        </View>
      </View>

      <View style={styles.menuWrap}>
        {MENU.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.menuItem}
            onPress={() => handleMenuPress(item.route)}
          >
            <View style={styles.menuLeft}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
              <Text style={styles.menuLabel}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.error }]} onPress={handleSignOut}>
        <Text style={[styles.outlineBtnText, { color: colors.error }]}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.title,
    color: colors.primaryForeground,
  },
  name: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
  },
  email: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 2,
  },
  phone: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  trustCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.success + '18',
    borderRadius: borderRadius.pill,
  },
  trustLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  trustValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.success,
  },
  menuWrap: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
  },
  outlineBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  outlineBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.lg,
  },
});
