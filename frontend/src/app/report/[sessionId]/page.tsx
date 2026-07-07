import ReportClient from "@/components/report/ReportClient";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ReportClient sessionId={sessionId} />;
}
