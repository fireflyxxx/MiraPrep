import PublicReportClient from "@/components/report/PublicReportClient";

// 分享页不套 AuthGuard：全站唯一一个匿名可访问的内容页。
export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicReportClient shareToken={token} />;
}
