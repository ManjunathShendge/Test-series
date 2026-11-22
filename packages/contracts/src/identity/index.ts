import { z } from 'zod';

/** Header carrying the server-issued device id (DECISIONS E19). An identifier, not authentication. */
export const DEVICE_ID_HEADER = 'x-device-id';

export const Platform = z.enum(['android', 'ios', 'web']);
export type Platform = z.infer<typeof Platform>;

export const Language = z.enum(['en', 'hi']);
export type Language = z.infer<typeof Language>;

export const PreparationStage = z.enum(['starting', 'revising', 'final-lap']);
export type PreparationStage = z.infer<typeof PreparationStage>;

export const Role = z.enum(['student', 'examiner', 'qc_reviewer', 'admin']);
export type Role = z.infer<typeof Role>;

export const Profile = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  fullName: z.string(),
  preferredLanguage: Language,
  preparationStage: PreparationStage.nullable(),
  targetExamIds: z.array(z.uuid()),
  roles: z.array(Role),
  /** The person has confirmed they are 18 or older (recorded with a time on the server). */
  ageConfirmed: z.boolean(),
  /** True once onboarding is complete: a preparation stage is set and 18+ is confirmed. */
  onboarded: z.boolean(),
});
export type Profile = z.infer<typeof Profile>;

export const Device = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  platform: Platform,
  isActive: z.boolean(),
  lastActiveAt: z.iso.datetime({ offset: true }),
  isCurrent: z.boolean(),
});
export type Device = z.infer<typeof Device>;

/** POST /v1/identity/session. Bearer Firebase ID token required. */
export const CreateSessionRequest = z.strictObject({
  /** Omit on first launch; the server issues one. Send the stored id afterwards. */
  deviceId: z.uuid().optional(),
  deviceName: z.string().trim().min(1).max(80),
  platform: Platform,
  /**
   * 18+ confirmation (PRD 12) when the client asks for it at sign-in, as the app does. The
   * website asks once during onboarding instead (PATCH /v1/me), so it omits this field.
   */
  ageConfirmed: z.literal(true).optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const SessionResponse = z.object({ profile: Profile, device: Device });
export type SessionResponse = z.infer<typeof SessionResponse>;

/** details of DEVICE_LIMIT_REACHED: the devices to choose from when revoking one. */
export const DeviceLimitDetails = z.object({ activeDevices: z.array(Device) });
export type DeviceLimitDetails = z.infer<typeof DeviceLimitDetails>;

/** PATCH /v1/me. Role, block and identity fields are never accepted here. */
export const UpdateMeRequest = z
  .strictObject({
    fullName: z.string().trim().min(1).max(120),
    preferredLanguage: Language,
    preparationStage: PreparationStage,
    targetExamIds: z.array(z.uuid()).max(10),
    /** One-way 18+ confirmation; required before onboarding can be completed. */
    ageConfirmed: z.literal(true),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateMeRequest = z.infer<typeof UpdateMeRequest>;

export const DeviceList = z.object({ items: z.array(Device) });
export type DeviceList = z.infer<typeof DeviceList>;
