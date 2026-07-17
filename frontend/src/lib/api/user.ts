import { apiClient } from "./client";
import { endpoints } from "./endpoints";
import type { UserProfile } from "./auth";

export type ExperienceLevel = "STUDENT" | "JUNIOR" | "MID" | "SENIOR";
export type ProfileStatus = "ACTIVE" | "INACTIVE";

export type UpdateProfileInput = {
  jobDirection: string | null;
  techStacks: string[];
  experienceLevel: ExperienceLevel | null;
  status: ProfileStatus | null;
  targetCompany: string | null;
  preferences: Record<string, unknown>;
};

export function updateMyProfile(input: UpdateProfileInput): Promise<UserProfile> {
  return apiClient<UserProfile>(endpoints.myProfile, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
