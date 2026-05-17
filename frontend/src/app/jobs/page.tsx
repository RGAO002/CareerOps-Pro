import { JobsShell } from "@/components/jobs/JobsShell";

interface Props {
  searchParams: Promise<{ from_upload?: string; resume?: string }>;
}

export default async function JobsPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <JobsShell
      animateIn={params.from_upload === "1"}
      resumeId={params.resume ?? null}
    />
  );
}
