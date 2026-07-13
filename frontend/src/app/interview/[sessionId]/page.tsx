import InterviewClient from "@/components/interview/InterviewClient";
import AuthGuard from "@/components/AuthGuard";

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <AuthGuard><InterviewClient sessionId={sessionId} /></AuthGuard>;
}
