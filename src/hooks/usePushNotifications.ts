/**
 * Stub hook — native push notifications are not available on web.
 * The app uses useWebPushNotifications for web push support.
 */
export const usePushNotifications = () => ({
  isRegistered: false,
  token: null,
  isNative: false,
  initializePushNotifications: async () => {},
  unregister: async () => {},
  checkPermissions: async () => false,
});
