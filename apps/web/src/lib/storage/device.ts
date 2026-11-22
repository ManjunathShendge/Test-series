/**
 * This browser's server-issued device id (DECISIONS E19). An identifier, not a credential:
 * the API still requires a valid sign-in for every request. Storage can be unavailable
 * (private windows, blocked site data), so every access is guarded.
 */
const DEVICE_KEY = 'mmp.deviceId';
const SIGNED_IN_KEY = 'mmp.signedIn';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the session still works for this tab.
  }
}

export const getDeviceId = () => read(DEVICE_KEY);
export const setDeviceId = (id: string | null) => write(DEVICE_KEY, id);

/** UI hint only (the header's account link); never used for authorization. */
export const getSignedInHint = () => read(SIGNED_IN_KEY) === '1';
export const AUTH_HINT_EVENT = 'mmp:auth-hint';
export const setSignedInHint = (on: boolean) => {
  write(SIGNED_IN_KEY, on ? '1' : null);
  try {
    window.dispatchEvent(new Event(AUTH_HINT_EVENT));
  } catch {
    // Non-browser context.
  }
};
