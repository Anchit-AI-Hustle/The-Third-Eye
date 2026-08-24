import { GenerationDetail } from "@/components/generations/GenerationDetail";

export const metadata = { title: "Generation — The Third Eye" };

export default async function GenerationDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <GenerationDetail id={params.id} />
    </div>
  );
}
