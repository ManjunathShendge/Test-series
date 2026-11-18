import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateMeRequest } from '@exam-prep/contracts';
import { useAppStore } from '@/lib/store/app';
import { listDevices, revokeDevice, updateMe } from './identity';

const devicesKey = ['me', 'devices'] as const;

/** The account's registered devices, from the API. */
export function useDevices() {
  return useQuery({ queryKey: devicesKey, queryFn: listDevices });
}

export function useRevokeDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: revokeDevice,
    onSuccess: () => client.invalidateQueries({ queryKey: devicesKey }),
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
