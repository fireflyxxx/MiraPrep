import AuthGuard from "@/components/AuthGuard";
import InterviewResultClient from "@/components/report/InterviewResultClient";

export default async function InterviewResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <AuthGuard>
      <InterviewResultClient sessionId={sessionId} />
    </AuthGuard>
  );
}
