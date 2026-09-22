"use client";

import { useState, useRef, useMemo } from "react";
import { createRideRequest } from "@/actions/rides";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { PlacesAutocomplete } from "@/components/places/places-autocomplete";
import { VISIBILITY_TIERS } from "@/lib/constants";

interface PlaceData {
  address: string;
  placeId: string;
  lat: number;
  lng: number;
}

/** Get today's date as YYYY-MM-DD */
function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RideRequestForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickup, setPickup] = useState<PlaceData | null>(null);
  const [dropoff, setDropoff] = useState<PlaceData | null>(null);
  const [rideDate, setRideDate] = useState("");
  const [rideTime, setRideTime] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const today = useMemo(() => getTodayString(), []);

  async function handleSubmit(formData: FormData) {
    if (!pickup?.address) {
      setError("Please enter a pickup location.");
      return;
    }
    if (!dropoff?.address) {
      setError("Please enter a drop-off location.");
      return;
    }
    if (!rideDate) {
      setError("Please select a date.");
      return;
    }
    if (!rideTime) {
      setError("Please select a time.");
      return;
    }

    setLoading(true);
    setError(null);

    // Add place data to form
    formData.set("pickup_address", pickup.address);
    formData.set("pickup_place_id", pickup.placeId);
    formData.set("pickup_lat", String(pickup.lat));
    formData.set("pickup_lng", String(pickup.lng));
    formData.set("dropoff_address", dropoff.address);
    formData.set("dropoff_place_id", dropoff.placeId);
    formData.set("dropoff_lat", String(dropoff.lat));
    formData.set("dropoff_lng", String(dropoff.lng));
    formData.set("is_round_trip", "false");
    formData.set("ride_date", rideDate);
    formData.set("ride_time", rideTime);

    const result = await createRideRequest(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Request a Ride</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form ref={formRef} action={handleSubmit} className="space-y-5">
        <PlacesAutocomplete
          label="Pickup location"
          name="pickup_display"
          onSelect={setPickup}
        />

        <PlacesAutocomplete
          label="Drop-off location"
          name="dropoff_display"
          onSelect={setDropoff}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="ride_date"
            name="ride_date"
            type="date"
            label="Date"
            required
            min={today}
            value={rideDate}
            onChange={(e) => setRideDate(e.target.value)}
          />
          <Input
            id="ride_time"
            name="ride_time"
            type="time"
            label="Time"
            required
            value={rideTime}
            onChange={(e) => setRideTime(e.target.value)}
          />
        </div>

        <Textarea
          id="notes"
          name="notes"
          label="Notes (optional)"
          placeholder="Any additional details for the driver..."
          rows={3}
        />

        {/* Visibility Tier */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Who can see this request?
          </label>
          <div className="space-y-2">
            {VISIBILITY_TIERS.map((tier) => (
              <label
                key={tier.value}
                className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <input
                  type="radio"
                  name="visibility"
                  value={tier.value}
                  defaultChecked={tier.value === "circle"}
                  className="mt-0.5 h-4 w-4 border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {tier.label}
                  </p>
                  <p className="text-xs text-gray-500">{tier.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Post Ride Request
        </Button>
      </form>
    </Card>
  );
}
