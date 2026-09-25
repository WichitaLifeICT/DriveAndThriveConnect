import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getRideRequest } from "@/actions/rides";
import { RideRequestForm } from "@/components/rides/ride-request-form";

export default async function EditRidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireUser();
  const ride = await getRideRequest(id);

  if (!ride || ride.rider_id !== user.id || ride.status !== "open") {
    redirect(`/rides/${id}`);
  }

  return <RideRequestForm ride={ride} />;
}
