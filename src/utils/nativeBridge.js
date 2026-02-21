const getPlugins = () => window.Capacitor?.Plugins || {};

export const isNativePlatform = () => {
    if (typeof window === 'undefined') return false;
    const cap = window.Capacitor;
    if (!cap) return false;
    if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
    return Boolean(cap.isNative);
};

export const setupViewportInsets = () => {
    if (typeof window === 'undefined') return () => { };

    const apply = () => {
        const vv = window.visualViewport;
        if (!vv) {
            document.documentElement.style.setProperty('--keyboard-offset', '0px');
            return;
        }
        const offset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        document.documentElement.style.setProperty('--keyboard-offset', `${Math.round(offset)}px`);
    };

    apply();
    window.addEventListener('resize', apply);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', apply);
        window.visualViewport.addEventListener('scroll', apply);
    }

    return () => {
        window.removeEventListener('resize', apply);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', apply);
            window.visualViewport.removeEventListener('scroll', apply);
        }
    };
};

export const configureNativeSystemUi = async () => {
    if (!isNativePlatform()) return;
    const { StatusBar, Keyboard } = getPlugins();
    try {
        if (StatusBar?.setOverlaysWebView) {
            await StatusBar.setOverlaysWebView({ overlay: false });
        }
    } catch (e) {
        console.warn('StatusBar setup skipped:', e?.message || e);
    }
    try {
        if (Keyboard?.setResizeMode) {
            await Keyboard.setResizeMode({ mode: 'native' });
        }
    } catch (e) {
        console.warn('Keyboard resize setup skipped:', e?.message || e);
    }
};

export const initNativePush = async ({ onToken, onPushReceived, onPushAction }) => {
    if (!isNativePlatform()) return () => { };
    const { PushNotifications } = getPlugins();
    if (!PushNotifications) return () => { };

    const listeners = [];
    const add = async (event, handler) => {
        if (!PushNotifications.addListener || !handler) return;
        const h = await PushNotifications.addListener(event, handler);
        listeners.push(h);
    };

    try {
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive !== 'granted') {
            perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== 'granted') return () => { };
    } catch (e) {
        console.warn('Push permission check failed:', e?.message || e);
        return () => { };
    }

    await add('registration', (token) => onToken && onToken(token.value));
    await add('registrationError', (err) => console.warn('Push registration error:', err));
    await add('pushNotificationReceived', (notification) => onPushReceived && onPushReceived(notification));
    await add('pushNotificationActionPerformed', (notification) => onPushAction && onPushAction(notification));

    try {
        await PushNotifications.register();
    } catch (e) {
        console.warn('Push register failed:', e);
    }

    return () => {
        listeners.forEach((h) => {
            try {
                h.remove();
            } catch (e) {
                console.warn('Push listener remove failed:', e?.message || e);
            }
        });
    };
};

export const showLocalNotification = async ({ title, body, data }) => {
    if (!isNativePlatform()) return false;
    const { LocalNotifications } = getPlugins();
    if (!LocalNotifications) return false;

    try {
        let perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
            perm = await LocalNotifications.requestPermissions();
        }
        if (perm.display !== 'granted') return false;

        const notificationId = Math.floor(Date.now() % 2147483000);
        await LocalNotifications.schedule({
            notifications: [{
                id: notificationId,
                title: title || 'TalkX',
                body: body || '',
                schedule: { at: new Date(Date.now() + 100) },
                sound: undefined,
                smallIcon: 'ic_launcher',
                extra: data || {}
            }]
        });
        return true;
    } catch (e) {
        console.warn('Local notification failed:', e);
        return false;
    }
};
