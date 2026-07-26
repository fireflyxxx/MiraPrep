import type {
  InterviewDifficulty,
  InterviewDuration,
  InterviewerStyle,
} from "./api/interview";

/**
 * 配置向导的选项 id 就是 T-030 `POST /interviews` 的取值，
 * 改这里等同于改接口契约，后端 `CreateInterviewRequest` 要同步。
 */

export const jobOptions = [
  { id: "frontend", label: "前端工程师", sub: "React / Vue / 工程化" },
  { id: "backend", label: "后端工程师", sub: "Java / Go / 分布式" },
  { id: "fullstack", label: "全栈工程师", sub: "前后端一体" },
  { id: "pm", label: "产品经理", sub: "需求 / 数据 / 增长" },
];

export const difficultyOptions: Array<{
  id: InterviewDifficulty;
  label: string;
  sub: string;
}> = [
  { id: "easy", label: "初级", sub: "应届 / 1 年内" },
  { id: "medium", label: "中级", sub: "1-3 年" },
  { id: "hard", label: "高级", sub: "3 年以上" },
];

export const durationOptions: Array<{ id: InterviewDuration; label: string }> = [
  { id: 15, label: "15 分钟" },
  { id: 30, label: "30 分钟" },
  { id: 45, label: "45 分钟" },
];

export const interviewTypeOptions = [
  { id: "technical", label: "技术面试" },
  { id: "technical_second", label: "技术二面" },
  { id: "hr", label: "HR 面试" },
  { id: "comprehensive", label: "综合面试" },
];

export const interviewerStyleOptions: Array<{
  id: InterviewerStyle;
  label: string;
  description: string;
}> = [
  { id: "friendly", label: "温和引导", description: "适度提示，帮助你逐步展开" },
  { id: "balanced", label: "标准专业", description: "贴近常规正式面试节奏" },
  { id: "strict", label: "高压追问", description: "持续追问细节与边界情况" },
];

/** 后端 `InterviewPhase` 枚举。报告接口回传小写，所以查表前先 normalize。 */
export const phaseLabels: Record<string, string> = {
  GREETING: "开场",
  SELF_INTRO: "自我介绍",
  RESUME_DEEP_DIVE: "项目深挖",
  DOMAIN_ASSESSMENT: "专业评估",
  BEHAVIORAL: "行为面试",
  CANDIDATE_QA: "候选人提问",
  CLOSING: "收尾",
};

export function phaseLabel(phase: string): string {
  return phaseLabels[phase.trim().toUpperCase()] ?? phase;
}

export function difficultyLabel(difficulty: string): string {
  return (
    difficultyOptions.find((option) => option.id === difficulty.trim().toLowerCase())
      ?.label ?? difficulty
  );
}

/** 只进 customRequirements 自由文本，不是独立接口字段。 */
export const focusOptions = [
  { id: "project", label: "项目深挖" },
  { id: "algo", label: "算法与数据结构" },
  { id: "system", label: "系统设计" },
  { id: "behavior", label: "行为面试" },
  { id: "stress", label: "压力测试" },
];
