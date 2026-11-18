import * as SecureStore from 'expo-secure-store';

const KEY = 'examprep.deviceId';

/**
 * The server-issued device id (DECISIONS E19), kept in the platform keychain/keystore.
 * It identifies this install to the API; it is not a credential.
 */
export async function getDeviceId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setDeviceId(id: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, id);
}
