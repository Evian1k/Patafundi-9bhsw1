export const linking = {
  prefixes: ['patafundi://', 'https://patafundi-9bhsw1.vercel.app'],
  config: {
    screens: {
      Login: 'login',
      Register: 'register',
      Otp: 'otp',
      ForgotPassword: 'forgot-password',
      HomeTab: {
        screens: {
          Home: 'home',
          CreateJob: 'jobs/new',
          JobTracking: 'jobs/:jobId',
          Chat: 'jobs/:jobId/chat',
          Review: 'jobs/:jobId/review',
          CreateDispute: 'jobs/:jobId/dispute',
        },
      },
      JobsTab: {
        screens: {
          Jobs: 'jobs',
        },
      },
      WalletTab: {
        screens: {
          Wallet: 'wallet',
        },
      },
      ProfileTab: {
        screens: {
          Profile: 'profile',
          EditProfile: 'profile/edit',
          SavedPlaces: 'profile/places',
          Notifications: 'profile/notifications',
          Disputes: 'profile/disputes',
          Support: 'profile/support',
          Settings: 'profile/settings',
        },
      },
    },
  },
};
