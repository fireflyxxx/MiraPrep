import ReportClient from "@/components/report/ReportClient";
import AuthGuard from "@/components/AuthGuard";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <AuthGuard><ReportClient sessionId={sessionId} /></AuthGuard>;
}
