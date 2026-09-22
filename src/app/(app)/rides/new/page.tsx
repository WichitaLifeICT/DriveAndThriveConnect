import { RideRequestForm } from "@/components/rides/ride-request-form";

export default function NewRidePage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">New Ride Request</h2>
      <RideRequestForm />
    </div>
  );
}
