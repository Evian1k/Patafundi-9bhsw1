import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiClient } from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';

/**
 * Push notifications (spec §35): foreground display handler + device token
 * registration. Registered tokens reach the backend's push queue (FCM) which
 * already powers notificationService.notify({ push: ... }).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(): void {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn || !Device.isDevice) return;
    let alive = true;
    (async () => {
      try {
        const settings = await Notifications.getPermissionsAsync();
        let granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
        if (!granted) {
          const request = await Notifications.requestPermissionsAsync();
          granted = request.granted || request.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
        }
        if (!granted || !alive) return;
        const token = await Notifications.getDevicePushTokenAsync();
        if (token?.data && alive) {
          await apiClient
            .registerDeviceToken(String(token.data), Platform.OS === 'ios' ? 'ios' : 'android')
            .catch(() => {
              // Non-fatal: push will retry next session; everything else works.
            });
        }
      } catch {
        // Push is best-effort - never block the app on registration.
      }
    })();
    return () => {
      alive = false;
    };
  }, [isLoggedIn]);
}
