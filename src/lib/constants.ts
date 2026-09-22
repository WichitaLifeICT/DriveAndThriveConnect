export const ROLES = [
  { value: "rider", label: "Rider" },
  { value: "driver", label: "Driver" },
] as const;

export const VISIBILITY_TIERS = [
  {
    value: "circle",
    label: "Circle Only",
    description: "Visible to your direct connections",
  },
  {
    value: "organization",
    label: "My Organization",
    description: "Visible to approved drivers in your organization",
  },
  {
    value: "community",
    label: "Approved Community Drivers",
    description:
      "Visible to drivers an admin has approved after reviewing their license and insurance. This is not a background check.",
  },
] as const;

export const RIDE_STATUSES = {
  open: { label: "Open", color: "bg-green-100 text-green-800" },
  matched: { label: "Matched", color: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", color: "bg-gray-100 text-gray-800" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800" },
  expired: { label: "Expired", color: "bg-gray-100 text-gray-600" },
} as const;

export const OFFER_STATUSES = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "Accepted", color: "bg-green-100 text-green-800" },
  declined: { label: "Declined", color: "bg-red-100 text-red-800" },
  withdrawn: { label: "Withdrawn", color: "bg-gray-100 text-gray-800" },
  backed_out: { label: "Backed out", color: "bg-orange-100 text-orange-800" },
  no_show: { label: "No-show", color: "bg-red-100 text-red-800" },
  cancelled: { label: "Ride cancelled", color: "bg-gray-100 text-gray-800" },
} as const;

export const REPORT_CATEGORIES = [
  { value: "safety_incident", label: "Safety incident", description: "Someone was hurt, threatened, or put in danger" },
  { value: "harassment", label: "Harassment", description: "Unwanted contact, threats, or abusive behavior" },
  { value: "unsafe_driving", label: "Unsafe driving", description: "Reckless or impaired driving, unsafe vehicle" },
  { value: "no_show", label: "No-show", description: "Didn't show up for an agreed ride" },
  { value: "inappropriate_message", label: "Inappropriate message", description: "Offensive, sexual, or spam messages" },
  { value: "other", label: "Something else", description: "Anything else an admin should know about" },
] as const;

export const REPORT_STATUSES = {
  open: { label: "Open", color: "bg-red-100 text-red-800" },
  reviewing: { label: "Reviewing", color: "bg-yellow-100 text-yellow-800" },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-800" },
} as const;

/** Upload limits for vetting documents */
export const VETTING_DOC_MAX_BYTES = 8 * 1024 * 1024;
export const VETTING_DOC_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp", "application/pdf"];

export const CONNECTION_STATUSES = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "Connected", color: "bg-green-100 text-green-800" },
  declined: { label: "Declined", color: "bg-red-100 text-red-800" },
} as const;

export const DRIVER_SCOPES = [
  {
    value: "friend",
    label: "Friends Only",
    description: "Drive only for your direct connections",
  },
  {
    value: "organization",
    label: "Organization",
    description: "Drive for your organization and direct connections",
  },
  {
    value: "community",
    label: "Community",
    description: "Drive for community-wide requests and direct connections",
  },
  {
    value: "any",
    label: "All of the Above",
    description: "Drive for friends, organization, and community requests",
  },
] as const;

export const DISCLAIMER_TEXT = `I understand and agree that:

1. Drive & Thrive Connect facilitates voluntary ride coordination between independent users.
2. Drive & Thrive Connect is not a transportation provider, carrier, employer, or insurer.
3. All rides are private agreements between users.
4. I am responsible for verifying the identity and suitability of anyone I ride with.
5. Drive & Thrive Connect does not perform background checks, verify driving records, or guarantee the safety of any ride.`;

export const FRIEND_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const FRIEND_CODE_LENGTH = 6;

/** Ride columns readable by signed-in users (share_token is server-only). */
export const RIDE_COLUMNS =
  "id, rider_id, pickup_address, pickup_place_id, pickup_lat, pickup_lng, dropoff_address, dropoff_place_id, dropoff_lat, dropoff_lng, ride_date, ride_time, is_round_trip, return_time, notes, visibility, status, matched_offer_id, created_at, updated_at, matched_at, completed_at, cancelled_at, picked_up_at, dropped_off_at, series_id, parent_ride_id";
