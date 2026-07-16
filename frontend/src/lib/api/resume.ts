"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "./client";
import { endpoints } from "./endpoints";
import { pollUntilSettled, type PollOptions } from "./poll";

export const MAX_RESUME_FILE_SIZE = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 40;

export type ResumeParseStatus = "pending" | "success" | "failed";

export interface ResumeBasics {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  headline?: string | null;
}

export interface ResumeEducation {
  school: string;
  degree?: string | null;
  major?: string | null;
  start?: string | null;
  end?: string | null;
}

export interface ResumeExperience {
  company: string;
  title?: string | null;
  start?: string | null;
  end?: string | null;
  highlights?: string[];
}

export interface ResumeProject {
  name: string;
  role?: string | null;
  tech?: string[];
  description?: string | null;
  highlights?: string[];
}

export interface ParsedResume {
  basics: ResumeBasics;
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  skills: string[];
  raw_text_excerpt?: string;
}

export interface ResumeSummary {
  id: number;
  fileName: string;
  fileSize: number;
  pageCount: number | null;
  parseStatus: ResumeParseStatus;
  isDefault: boolean;
  createdAt: string;
}

export interface ResumeDetail extends ResumeSummary {
  parsedJson: ParsedResume | null;
  downloadUrl: string | null;
}

export interface ResumeListResponse {
  items: ResumeSummary[];
  total: number;
  page: number;
  size: number;
}

export interface UpdateResumeInput {
  id: number;
  fileName?: string;
  isDefault?: boolean;
}

export const resumeKeys = {
  all: ["resumes"] as const,
  list: () => ["resumes", "list", 1, 20] as const,
  detail: (id: number) => ["resumes", "detail", id] as const,
};

export function validateResumeFile(file: File): string | null {
  if (file.size > MAX_RESUME_FILE_SIZE) return "文件不能超过 10 MB";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx") return "仅支持 PDF 或 DOCX 文件";
  return null;
}

export async function listResumes(): Promise<ResumeListResponse> {
  return apiClient<ResumeListResponse>(`${endpoints.resumes}?page=1&size=20`);
}

export async function getResume(id: number, signal?: AbortSignal): Promise<ResumeDetail> {
  return apiClient<ResumeDetail>(`${endpoints.resumes}/${id}`, { signal });
}

export async function uploadResume(file: File): Promise<ResumeSummary> {
  const formData = new FormData();
  formData.append("file", file);
  return apiClient<ResumeSummary>(endpoints.resumes, { method: "POST", body: formData });
}

export async function deleteResume(id: number): Promise<void> {
  return apiClient<void>(`${endpoints.resumes}/${id}`, { method: "DELETE" });
}

export async function updateResume(input: UpdateResumeInput): Promise<ResumeSummary> {
  const { id, ...body } = input;
  return apiClient<ResumeSummary>(`${endpoints.resumes}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function pollResumeUntilSettled(
  id: number,
  options: PollOptions & {
    getResume?: (id: number, signal?: AbortSignal) => Promise<ResumeDetail>;
  } = {},
): Promise<ResumeDetail> {
  const fetchResume = options.getResume ?? getResume;
  return pollUntilSettled(
    (signal) => fetchResume(id, signal),
    (resume) => resume.parseStatus === "pending",
    {
      intervalMs: options.intervalMs ?? POLL_INTERVAL_MS,
      maxAttempts: options.maxAttempts ?? MAX_POLL_ATTEMPTS,
      signal: options.signal,
    },
  );
}

export function updateResumeListCache(queryClient: QueryClient, updated: ResumeSummary): void {
  queryClient.setQueryData<ResumeListResponse>(resumeKeys.list(), (current) => {
    if (!current) return current;
    return {
      ...current,
      items: current.items.map((item) =>
        item.id === updated.id
          ? updated
          : updated.isDefault
            ? { ...item, isDefault: false }
            : item,
      ),
    };
  });
}

export function selectInitialResumeId(
  resumes: ResumeSummary[],
  requestedResumeId: string | null,
): number | null {
  const readyResumes = resumes.filter((resume) => resume.parseStatus === "success");
  const requested = requestedResumeId ? Number(requestedResumeId) : Number.NaN;
  if (Number.isSafeInteger(requested) && readyResumes.some((resume) => resume.id === requested)) {
    return requested;
  }
  return readyResumes.find((resume) => resume.isDefault)?.id ?? readyResumes[0]?.id ?? null;
}

export function useResumeLibrary() {
  return useQuery({ queryKey: resumeKeys.list(), queryFn: listResumes });
}

export function useResumeDetail(id: number | null) {
  return useQuery({
    queryKey: id === null ? [...resumeKeys.all, "detail", "none"] : resumeKeys.detail(id),
    queryFn: () => getResume(id!),
    enabled: id !== null,
  });
}

export function useUploadResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      onUploadAccepted,
      signal,
    }: {
      file: File;
      onUploadAccepted?: (resume: ResumeSummary) => void;
      signal?: AbortSignal;
    }) => {
      const uploaded = await uploadResume(file);
      queryClient.setQueryData<ResumeListResponse>(resumeKeys.list(), (current) => ({
        items: [uploaded, ...(current?.items.filter((item) => item.id !== uploaded.id) ?? [])],
        total: (current?.total ?? 0) + (current?.items.some((item) => item.id === uploaded.id) ? 0 : 1),
        page: 1,
        size: 20,
      }));
      onUploadAccepted?.(uploaded);
      return pollResumeUntilSettled(uploaded.id, { signal });
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(resumeKeys.detail(detail.id), detail);
      updateResumeListCache(queryClient, detail);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: resumeKeys.all }),
  });
}

export function useUpdateResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateResume,
    onSuccess: (updated) => {
      updateResumeListCache(queryClient, updated);
      queryClient.setQueryData<ResumeDetail>(resumeKeys.detail(updated.id), (detail) =>
        detail ? { ...detail, ...updated } : detail,
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新简历失败"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: resumeKeys.all }),
  });
}

export function useDeleteResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteResume,
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: resumeKeys.detail(id) });
      queryClient.setQueryData<ResumeListResponse>(resumeKeys.list(), (current) =>
        current
          ? { ...current, items: current.items.filter((item) => item.id !== id), total: Math.max(0, current.total - 1) }
          : current,
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "删除简历失败"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: resumeKeys.all }),
  });
}
