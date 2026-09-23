export const BACK_ACTIONS = Object.freeze({
    CLOSE_PERMISSION: 'close_permission',
    CLOSE_IMAGE: 'close_image',
    EXIT_OR_CONFIRM: 'exit_or_confirm',
    LEAVE_TRANSIENT: 'leave_transient',
    NAVIGATE_HOME: 'navigate_home',
    NAVIGATE_ROOT: 'navigate_root'
});

export const resolveBackAction = ({
    authenticated = false,
    imageViewerOpen = false,
    legalOpen = false,
    permissionOpen = false,
    screen = 'home'
} = {}) => {
    if (permissionOpen) return BACK_ACTIONS.CLOSE_PERMISSION;
    if (legalOpen) return BACK_ACTIONS.NAVIGATE_ROOT;
    if (!authenticated) return BACK_ACTIONS.EXIT_OR_CONFIRM;
    if (imageViewerOpen) return BACK_ACTIONS.CLOSE_IMAGE;
    if (screen === 'chat' || screen === 'matching') return BACK_ACTIONS.LEAVE_TRANSIENT;
    if (screen === 'friends') return BACK_ACTIONS.NAVIGATE_HOME;
    if (screen === 'home' || screen === 'splash') return BACK_ACTIONS.EXIT_OR_CONFIRM;
    return BACK_ACTIONS.NAVIGATE_HOME;
};
