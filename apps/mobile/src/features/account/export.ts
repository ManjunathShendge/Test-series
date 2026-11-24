import { Alert, Share } from 'react-native';
import { exportMyData } from '@/lib/api/account';
import { ApiRequestError } from '@/lib/api/http';

/** Data export (docs/SECURITY.md): the account's records as JSON, through the share sheet. */
export async function shareMyData(): Promise<void> {
  try {
    const data = await exportMyData();
    await Share.share({ title: 'My exam prep data', message: JSON.stringify(data, null, 2) });
  } catch (e) {
    Alert.alert('Could not export your data', e instanceof ApiRequestError ? e.message : 'Check your connection and try again.');
  }
}
