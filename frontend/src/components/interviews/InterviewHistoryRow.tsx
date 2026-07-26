import Link from "next/link";
import type { InterviewListItem } from "@/lib/api/interview";
import { difficultyLabel } from "@/lib/interview-options";

const gradeBadgeClasses: Record<NonNullable<InterviewListItem["grade"]>, string> = {
  S: "bg-grade-s/15 text-grade-s",
  A: "bg-grade-a/15 text-grade-a",
  B: "bg-grade-b/15 text-grade-b",
  C: "bg-grade-c/15 text-grade-c",
  D: "bg-grade-d/15 text-grade-d",
};

const formatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间待同步" : formatter.format(date);
}

function durationText(item: InterviewListItem): string {
  if (item.actualDurationSeconds !== null) {
    return `实际 ${Math.max(1, Math.round(item.actualDurationSeconds / 60))} 分钟`;
  }
  return `计划 ${item.durationMin} 分钟`;
}

function statusPresentation(item: InterviewListItem): {
  label: string;
  className: string;
} {
  if (item.reportStatus === "ready") {
    return { label: "报告已生成", className: "bg-success/10 text-success" };
  }
  if (item.reportStatus === "grading") {
    return { label: "批改中", className: "bg-orange-500/10 text-orange-600" };
  }
  if (item.reportStatus === "failed") {
    return { label: "报告生成失败", className: "bg-destructive/10 text-destructive" };
  }
  if (item.status === "ongoing") {
    return { label: "进行中", className: "bg-primary/10 text-primary" };
  }
  if (item.status === "aborted") {
    return { label: "已中止", className: "bg-muted text-muted-foreground" };
  }
  if (item.status === "completed") {
    return { label: "已结束", className: "bg-muted text-muted-foreground" };
  }
  return { label: "准备中", className: "bg-muted text-muted-foreground" };
}

function RowAction({ item }: { item: InterviewListItem }) {
  if (item.reportStatus === "ready") {
    return (
      <Link
        href={`/report/${item.sessionId}`}
        transitionTypes={["nav-forward"]}
        className="mira-button inline-flex min-h-10 items-center justify-center rounded-[10px] bg-orange-500 px-4 text-[13px] font-medium text-white hover:text-white"
      >
        查看报告 →
      </Link>
    );
  }
  if (item.status === "ongoing") {
    return (
      <Link
        href={`/interview/${item.sessionId}`}
        transitionTypes={["nav-forward"]}
        className="mira-button inline-flex min-h-10 items-center justify-center rounded-[10px] border border-border px-4 text-[13px] font-medium"
      >
        继续面试 →
      </Link>
    );
  }
  if (item.reportStatus === "grading") {
    return <span className="text-[13px] text-muted-foreground">报告生成中</span>;
  }
  if (item.reportStatus === "failed") {
    return <span className="text-[13px] text-destructive">生成失败，请稍后重试</span>;
  }
  if (item.status === "aborted") {
    return <span className="text-[13px] text-muted-foreground">本场已中止</span>;
  }
  return <span className="text-[13px] text-muted-foreground">暂无可用报告</span>;
}

export default function InterviewHistoryRow({
  item,
  isLast,
}: {
  item: InterviewListItem;
  isLast: boolean;
}) {
  const status = statusPresentation(item);

  return (
    <article
      className={`grid min-w-0 gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center ${
        isLast ? "" : "border-b border-muted"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] font-display text-lg font-bold ${
            item.grade
              ? gradeBadgeClasses[item.grade]
              : "bg-muted text-muted-foreground"
          }`}
        >
          {item.grade ?? "—"}
        </span>
        <div className="min-w-0">
          <h4 className="m-0 truncate text-sm font-medium">{item.jobTitle || "模拟面试"}</h4>
          <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">
            {difficultyLabel(item.difficulty)} · {item.questionCount} 题 · {durationText(item)}
          </p>
        </div>
      </div>

      <time className="text-[12.5px] text-muted-foreground" dateTime={item.createdAt}>
        {formatDate(item.createdAt)}
      </time>
      <span className={`w-fit rounded-full px-2.5 py-1 text-xs ${status.className}`}>
        {status.label}
      </span>
      <div className="flex min-h-10 items-center lg:min-w-[142px] lg:justify-end">
        <RowAction item={item} />
      </div>
    </article>
  );
}
