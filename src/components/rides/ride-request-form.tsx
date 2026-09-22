"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createRideRequest, updateRideRequest } from "@/actions/rides";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { PlacesAutocomplete } from "@/components/places/places-autocomplete";
import { VISIBILITY_TIERS } from "@/lib/constants";
import type { RideRequest } from "@/types/database";

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

function placeFrom(ride: RideRequest | undefined, kind: "pickup" | "dropoff"): PlaceData | null {
  if (!ride) return null;
  return {
    address: ride[`${kind}_address`],
    placeId: ride[`${kind}_place_id`] || "",
    lat: ride[`${kind}_lat`] ?? NaN,
    lng: ride[`${kind}_lng`] ?? NaN,
  };
}

interface RideRequestFormProps {
  /** When set, the form edits this ride instead of creating one */
  ride?: RideRequest;
}

export function RideRequestForm({ ride }: RideRequestFormProps) {
  const router = useRouter();
  const isEdit = !!ride;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickup, setPickup] = useState<PlaceData | null>(placeFrom(ride, "pickup"));
  const [dropoff, setDropoff] = useState<PlaceData | null>(placeFrom(ride, "dropoff"));
  const [rideDate, setRideDate] = useState(ride?.ride_date || "");
  const [rideTime, setRideTime] = useState(ride?.ride_time?.slice(0, 5) || "");
  const [roundTrip, setRoundTrip] = useState(ride?.is_round_trip || false);
  const [returnTime, setReturnTime] = useState(ride?.return_time?.slice(0, 5) || "");
  const [separateReturn, setSeparateReturn] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
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
    if (roundTrip && !returnTime) {
      setError("Please select a return time.");
      return;
    }

    setLoading(true);
    setError(null);

    // Add place data to form
    formData.set("pickup_address", pickup.address);
    formData.set("pickup_place_id", pickup.placeId);
    formData.set("pickup_lat", Number.isFinite(pickup.lat) ? String(pickup.lat) : "");
    formData.set("pickup_lng", Number.isFinite(pickup.lng) ? String(pickup.lng) : "");
    formData.set("dropoff_address", dropoff.address);
    formData.set("dropoff_place_id", dropoff.placeId);
    formData.set("dropoff_lat", Number.isFinite(dropoff.lat) ? String(dropoff.lat) : "");
    formData.set("dropoff_lng", Number.isFinite(dropoff.lng) ? String(dropoff.lng) : "");
    formData.set("is_round_trip", roundTrip ? "true" : "false");
    formData.set("return_time", roundTrip ? returnTime : "");
    formData.set("separate_return", roundTrip && separateReturn ? "true" : "false");
    formData.set("repeat_weeks", String(repeatWeeks));
    formData.set("ride_date", rideDate);
    formData.set("ride_time", rideTime);

    if (isEdit) {
      const result = await updateRideRequest(ride.id, formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      router.push(`/rides/${ride.id}`);
      router.refresh();
      return;
    }

    const result = await createRideRequest(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">{isEdit ? "Edit Ride Request" : "Request a Ride"}</h2>

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
          defaultValue={ride?.pickup_address}
        />

        <PlacesAutocomplete
          label="Drop-off location"
          name="dropoff_display"
          onSelect={setDropoff}
          defaultValue={ride?.dropoff_address}
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
            label="Pickup time"
            required
            value={rideTime}
            onChange={(e) => setRideTime(e.target.value)}
          />
        </div>

        {/* Round trip */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={roundTrip}
              onChange={(e) => setRoundTrip(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-gray-900">I need a ride back too (round trip)</span>
          </label>

          {roundTrip && (
            <div className="pl-6 space-y-3">
              <Input
                id="return_time"
                name="return_time_display"
                type="time"
                label="Return pickup time"
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
              />
              {!isEdit && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={separateReturn}
                    onChange={(e) => setSeparateReturn(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    <span className="block text-sm text-gray-900">Post the return as its own ride</span>
                    <span className="block text-xs text-gray-500">
                      A different driver can take the way back — useful for long appointments.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Repeat weekly */}
        {!isEdit && (
          <div>
            <label htmlFor="repeat_weeks" className="block text-sm font-medium text-gray-700 mb-1">
              Repeat
            </label>
            <select
              id="repeat_weeks"
              value={repeatWeeks}
              onChange={(e) => setRepeatWeeks(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value={1}>Just this once</option>
              {[2, 3, 4, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  Every week for {n} weeks
                </option>
              ))}
            </select>
            {repeatWeeks > 1 && (
              <p className="text-xs text-gray-500 mt-1">
                Each week is posted as its own ride, so different drivers can help. You can cancel one week or the
                whole series later.
              </p>
            )}
          </div>
        )}

        <Textarea
          id="notes"
          name="notes"
          label="Notes (optional)"
          placeholder="Any additional details for the driver..."
          rows={3}
          maxLength={1000}
          defaultValue={ride?.notes || ""}
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
                  defaultChecked={tier.value === (ride?.visibility || "circle")}
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
          {isEdit ? "Save Changes" : repeatWeeks > 1 ? `Post ${repeatWeeks} Weekly Rides` : "Post Ride Request"}
        </Button>
        {isEdit && (
          <Button type="button" variant="secondary" className="w-full" onClick={() => router.back()}>
            Cancel
          </Button>
        )}
      </form>
    </Card>
  );
}
