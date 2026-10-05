import { z } from 'zod';

export const VEHICLE_TYPES = ['car', 'bus', 'truck', 'motorcycle'] as const;
export const VehicleTypeSchema = z.enum(VEHICLE_TYPES);
export type VehicleType = z.infer<typeof VehicleTypeSchema>;

export const ISSUE_TYPES = [
	'flat_tyre',
	'puncture',
	'tyre_burst',
	'no_spare',
	'needs_air',
	'other',
] as const;
export const IssueTypeSchema = z.enum(ISSUE_TYPES);
export type IssueType = z.infer<typeof IssueTypeSchema>;

export const USER_ROLES = ['driver', 'provider'] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;
