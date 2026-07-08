import InterviewClient from "@/components/interview/InterviewClient";

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <InterviewClient sessionId={sessionId} />;
}
