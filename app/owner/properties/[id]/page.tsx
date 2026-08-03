import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function OwnerPropertyPage({ params }: Props) {
  const { id } = await params;
  redirect(`/owner/properties/${id}/calendar`);
}
