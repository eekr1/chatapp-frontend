import { normalizeClientState } from '../ui/screenState';

export default function ClientStateMessage({ state = 'ready', children, id, focusable = false }) {
    const normalized = normalizeClientState(state);
    if (!children || normalized === 'ready') return null;
    const isError = normalized === 'partial_error' || normalized === 'forbidden';
    return (
        <div
            id={id}
            className={`client-state-message is-${normalized}`}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            tabIndex={focusable ? -1 : undefined}
        >
            {children}
        </div>
    );
}
