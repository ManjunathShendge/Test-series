import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AccountExport,
  DeletionStatus,
  Entitlements,
  FollowingFeed,
  MyPurchaseList,
  NotificationPrefs,
  type UpdateMeRequest,
  type UpdateNotificationPrefs,
} from '@exam-prep/contracts';
import { useAppStore } from '@/lib/store/app';
import { apiRequest } from './http';
import { getMe, listDevices, revokeDevice, updateMe } from './identity';

export const accountKeys = {
  devices: ['me', 'devices'] as const,
  entitlements: ['me', 'entitlements'] as const,
  following: ['me', 'following'] as const,
  purchases: ['me', 'purchases'] as const,
  notificationPrefs: ['me', 'notification-preferences'] as const,
};

const useSignedIn = () => useAppStore((s) => s.session.signedIn);

/** The account's registered devices, from the API. */
export function useDevices() {
  return useQuery({ queryKey: accountKeys.devices, queryFn: listDevices });
}

export function useRevokeDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: revokeDevice,
    onSuccess: () => client.invalidateQueries({ queryKey: accountKeys.devices }),
  });
}

/** Saves profile preferences on the server, then mirrors the server's answer locally. */
export function useUpdateProfile() {
  const apply = useAppStore((s) => s.applyServerProfile);
  return useMutation({
    mutationFn: (changes: UpdateMeRequest) => updateMe(changes),
    onSuccess: (profile) => apply(profile),
  });
}

// Entitlements ---------------------------------------------------------------------------------

/** Tests and series the student can open. The server checks again on every paper request. */
export function useEntitlements() {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: accountKeys.entitlements,
    queryFn: () => apiRequest('GET', '/me/entitlements', { schema: Entitlements }),
    enabled: signedIn,
    staleTime: 30_000,
  });
}

/** Access for UI purposes: free, owned directly, or owned through its series. */
export function useAccess() {
  const { data } = useEntitlements();
  return (test: { id: string; pricePaise: number; seriesId?: string | undefined }) =>
    test.pricePaise === 0 ||
    !!data?.testIds.includes(test.id) ||
    (test.seriesId !== undefined && !!data?.seriesIds.includes(test.seriesId));
}

export function useMyPurchases() {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: accountKeys.purchases,
    queryFn: async () => (await apiRequest('GET', '/me/purchases', { schema: MyPurchaseList })).items,
    enabled: signedIn,
  });
}

// Following ------------------------------------------------------------------------------------

export function useFollowing() {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: accountKeys.following,
    queryFn: () => apiRequest('GET', '/me/following', { schema: FollowingFeed }),
    enabled: signedIn,
    staleTime: 30_000,
  });
}

/** Follow state for one examiner plus a toggle that updates the list optimistically. */
export function useFollow() {
  const client = useQueryClient();
  const following = useFollowing();
  const ids = new Set(following.data?.examiners.map((e) => e.id) ?? []);
  const mutation = useMutation({
    mutationFn: ({ id, follow }: { id: string; follow: boolean }) => apiRequest(follow ? 'PUT' : 'DELETE', `/me/following/${id}`),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: accountKeys.following });
      void client.invalidateQueries({ queryKey: ['catalogue', 'examiner'] });
    },
  });
  const pending = mutation.isPending ? mutation.variables : undefined;
  const isFollowed = (id: string) => (pending?.id === id ? pending.follow : ids.has(id));
  return {
    isFollowed,
    toggle: (id: string) => mutation.mutate({ id, follow: !isFollowed(id) }),
    error: mutation.error,
  };
}

// Notification preferences -------------------------------------------------------------------

/** Optional push notices the student can switch off; transactional notices are always sent. */
export function useNotificationPrefs() {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: accountKeys.notificationPrefs,
    queryFn: () => apiRequest('GET', '/me/notification-preferences', { schema: NotificationPrefs }),
    enabled: signedIn,
  });
}

/** Saves a change, showing it at once and putting the previous value back if the server refuses. */
export function useUpdateNotificationPrefs() {
  const client = useQueryClient();
  const key = accountKeys.notificationPrefs;
  return useMutation({
    mutationFn: (changes: UpdateNotificationPrefs) =>
      apiRequest('PUT', '/me/notification-preferences', { body: changes, schema: NotificationPrefs }),
    onMutate: async (changes) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<NotificationPrefs>(key);
      if (previous) {
        const next = { ...previous };
        for (const k of Object.keys(previous) as (keyof NotificationPrefs)[]) next[k] = changes[k] ?? previous[k];
        client.setQueryData<NotificationPrefs>(key, next);
      }
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: (prefs) => client.setQueryData(key, prefs),
  });
}

// Account deletion and export ----------------------------------------------------------------

/** Starts or cancels deletion, then refreshes the profile so every screen shows the state. */
export function useDeletion() {
  const apply = useAppStore((s) => s.applyServerProfile);
  const refresh = async () => apply(await getMe());
  return {
    request: useMutation({
      mutationFn: () => apiRequest('POST', '/me/deletion', { schema: DeletionStatus }),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: () => apiRequest('DELETE', '/me/deletion', { schema: DeletionStatus }),
      onSuccess: refresh,
    }),
  };
}

export const exportMyData = () => apiRequest('GET', '/me/export', { schema: AccountExport });
