import { MediaJob } from "./MediaJob";

export default async function Page({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  return <MediaJob ticket={(await searchParams).ticket ?? ""} />;
}
