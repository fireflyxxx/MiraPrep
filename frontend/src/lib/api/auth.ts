import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type AuthUser = {
  id: number;
  email: string;
  nickname: string | null;
  avatar: string | null;
  isFirstLogin: boolean;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = LoginInput & {
  nickname: string;
  code: string;
};

export type UserProfile = {
  jobDirection: string | null;
  techStacks: string[];
  experienceLevel: string | null;
  status: string | null;
  targetCompany: string | null;
  preferences: Record<string, unknown>;
};

const jsonRequest = (body: unknown) => ({
  method: "POST",
  body: JSON.stringify(body),
  skipAuthRefresh: true,
});

export function login(input: LoginInput): Promise<AuthResponse> {
  return apiClient<AuthResponse>(endpoints.login, jsonRequest(input));
}

export function register(input: RegisterInput): Promise<AuthResponse> {
  return apiClient<AuthResponse>(endpoints.register, jsonRequest(input));
}

export function sendVerificationCode(email: string): Promise<Record<string, never>> {
  return apiClient<Record<string, never>>(
    endpoints.sendCode,
    jsonRequest({ email, scene: "register" }),
  );
}

export function getMe(): Promise<AuthUser> {
  return apiClient<AuthUser>(endpoints.me);
}

export function getMyProfile(): Promise<UserProfile> {
  return apiClient<UserProfile>(endpoints.myProfile);
}

export function useMeQuery(enabled = true) {
  return useQuery({ queryKey: ["user", "me"], queryFn: getMe, enabled });
}

export function useMyProfileQuery(enabled = true) {
  return useQuery({ queryKey: ["user", "profile"], queryFn: getMyProfile, enabled });
}
