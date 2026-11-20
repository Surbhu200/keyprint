import { redirect } from "next/navigation";

/** A bare lease link (/lease/<id>) opens the lease's 3D room instead of a 404. */
export default async function LeaseIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/lease/${encodeURIComponent(id)}/room`);
}
