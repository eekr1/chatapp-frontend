const getPlugins = () => window.Capacitor?.Plugins || {};

const normalizePermissionState = (value) => {
    const raw = String(value || '').toLowerCase().trim();
    if (raw === 'granted' || raw === 'limited') return 'granted';
    if (raw === 'denied' || raw === 'prompt-with-rationale') return 'denied';
    if (raw === 'prompt') return 'prompt';
    return 'unavailable';
};

const normalizeCameraDataUrl = (photo) => {
    if (!photo || typeof photo !== 'object') return null;

    if (typeof photo.dataUrl === 'string' && photo.dataUrl.startsWith('data:')) {
        return photo.dataUrl;
    }

    if (typeof photo.base64String === 'string' && photo.base64String.trim()) {
        const format = String(photo.format || 'jpeg').toLowerCase();
        return `data:image/${format};base64,${photo.base64String}`;
    }

    return null;
};

const pickNativeImage = async (source) => {
    if (!isNativePlatform()) return null;
    const { Camera } = getPlugins();
    if (!Camera?.getPhoto) return null;

    try {
        const photo = await Camera.getPhoto({
            quality: 80,
            allowEditing: false,
            resultType: 'dataUrl',
            source,
            width: 1600,
            correctOrientation: true
        });
        return normalizeCameraDataUrl(photo);
    } catch (e) {
        console.warn('Native image pick failed:', e?.message || e);
        return null;
    }
};

export const CHANNEL_IDS = {
    messages: 'talkx_messages_v3',
    admin: 'talkx_admin_v3',
    default: 'talkx_default_v3'
};
const LEGACY_CHANNEL_IDS = [
    'talkx_messages',
    'talkx_admin',
    'talkx_default',
    'talkx_messages_v2',
    'talkx_admin_v2',
    'talkx_default_v2'
];
const PUSH_CHANNELS = [
    {
        id: CHANNEL_IDS.messages,
        name: 'TalkX Messages',
        description: 'Friend message notifications',
        importance: 5,
        sound: 'default',
        vibration: true,
        lights: true,
        visibility: 1
    },
    {
        id: CHANNEL_IDS.admin,
        name: 'TalkX Announcements',
        description: 'System and admin announcements',
        importance: 5,
        sound: 'default',
        vibration: true,
        lights: true,
        visibility: 1
    },
    {
        id: CHANNEL_IDS.default,
        name: 'TalkX General',
        description: 'Fallback notifications',
        importance: 5,
        sound: 'default',
        vibration: true,
        lights: true,
        visibility: 1
    }
];

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

export const addNativeBackButtonListener = async (handler) => {
    if (!isNativePlatform()) return () => { };
    const { App } = getPlugins();
    if (!App?.addListener || typeof handler !== 'function') return () => { };

    try {
        const listener = await App.addListener('backButton', (event) => {
            try {
                handler(event || {});
            } catch (e) {
                console.warn('Back button handler failed:', e?.message || e);
            }
        });
        return () => {
            try {
                listener?.remove?.();
            } catch (e) {
                console.warn('Back button listener remove failed:', e?.message || e);
            }
        };
    } catch (e) {
        console.warn('Back button listener setup failed:', e?.message || e);
        return () => { };
    }
};

export const exitNativeApp = async () => {
    if (!isNativePlatform()) return false;
    const { App } = getPlugins();
    if (!App?.exitApp) return false;
    try {
        await App.exitApp();
        return true;
    } catch (e) {
        console.warn('Native exitApp failed:', e?.message || e);
        return false;
    }
};

export const requestPushPermission = async () => {
    if (!isNativePlatform()) return { status: 'unavailable', source: 'web' };
    const { PushNotifications } = getPlugins();
    if (!PushNotifications?.checkPermissions || !PushNotifications?.requestPermissions) {
        return { status: 'unavailable', source: 'plugin-missing' };
    }

    try {
        let perm = await PushNotifications.checkPermissions();
        let receive = normalizePermissionState(perm?.receive);
        if (receive !== 'granted') {
            perm = await PushNotifications.requestPermissions();
            receive = normalizePermissionState(perm?.receive);
        }
        return { status: receive === 'granted' ? 'granted' : 'denied', raw: perm };
    } catch (e) {
        console.warn('Push permission request failed:', e?.message || e);
        return { status: 'unavailable', error: e?.message || String(e) };
    }
};

export const requestCameraAndPhotosPermission = async () => {
    if (!isNativePlatform()) {
        return {
            status: 'unavailable',
            camera: 'unavailable',
            photos: 'unavailable',
            source: 'web'
        };
    }
    const { Camera } = getPlugins();
    if (!Camera?.checkPermissions || !Camera?.requestPermissions) {
        return {
            status: 'unavailable',
            camera: 'unavailable',
            photos: 'unavailable',
            source: 'plugin-missing'
        };
    }

    try {
        let perms = await Camera.checkPermissions();
        let camera = normalizePermissionState(perms?.camera);
        let photos = normalizePermissionState(perms?.photos);

        if (camera !== 'granted' || photos !== 'granted') {
            perms = await Camera.requestPermissions();
            camera = normalizePermissionState(perms?.camera);
            photos = normalizePermissionState(perms?.photos);
        }

        const status = camera === 'granted' && photos === 'granted'
            ? 'granted'
            : 'denied';
        return { status, camera, photos, raw: perms };
    } catch (e) {
        console.warn('Camera/photos permission request failed:', e?.message || e);
        return {
            status: 'unavailable',
            camera: 'unavailable',
            photos: 'unavailable',
            error: e?.message || String(e)
        };
    }
};

export const requestInitialPermissions = async () => {
    const push = await requestPushPermission();
    const media = await requestCameraAndPhotosPermission();
    return { push, media };
};

export const initNativePush = async ({
    onToken,
    onPushReceived,
    onPushAction,
    requestPermission = true
}) => {
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
            if (!requestPermission) return () => { };
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
        if (PushNotifications.listChannels && PushNotifications.createChannel) {
            const existing = await PushNotifications.listChannels();
            const existingIds = new Set((existing?.channels || []).map((c) => c.id));
            if (PushNotifications.deleteChannel) {
                for (const legacyId of LEGACY_CHANNEL_IDS) {
                    if (!existingIds.has(legacyId)) continue;
                    try {
                        await PushNotifications.deleteChannel({ id: legacyId });
                    } catch (e) {
                        console.warn(`Legacy channel delete skipped (${legacyId}):`, e?.message || e);
                    }
                }
            }
            for (const channel of PUSH_CHANNELS) {
                if (existingIds.has(channel.id)) continue;
                await PushNotifications.createChannel(channel);
            }
        }
    } catch (e) {
        console.warn('Push channel setup failed:', e?.message || e);
    }

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
        const channelId = data?.channelId || CHANNEL_IDS.default;
        await LocalNotifications.schedule({
            notifications: [{
                id: notificationId,
                title: title || 'TalkX',
                body: body || '',
                schedule: { at: new Date(Date.now() + 100) },
                sound: undefined,
                smallIcon: 'ic_launcher',
                channelId,
                extra: data || {}
            }]
        });
        return true;
    } catch (e) {
        console.warn('Local notification failed:', e);
        return false;
    }
};

export const pickImageFromCamera = async () => pickNativeImage('CAMERA');

export const pickImageFromGallery = async () => pickNativeImage('PHOTOS');
