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
    description: "Visible to vetted drivers in your organization",
  },
  {
    value: "community",
    label: "Community Vetted Drivers",
    description: "Visible to admin-approved vetted drivers",
  },
] as const;

export const RIDE_STATUSES = {
  open: { label: "Open", color: "bg-green-100 text-green-800" },
  matched: { label: "Matched", color: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", color: "bg-gray-100 text-gray-800" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800" },
} as const;

export const OFFER_STATUSES = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "Accepted", color: "bg-green-100 text-green-800" },
  declined: { label: "Declined", color: "bg-red-100 text-red-800" },
  withdrawn: { label: "Withdrawn", color: "bg-gray-100 text-gray-800" },
} as const;

export const CONNECTION_STATUSES = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "Connected", color: "bg-green-100 text-green-800" },
  declined: { label: "Declined", color: "bg-red-100 text-red-800" },
} as const;

export const ORGANIZATIONS = [
  "Hope 4 Da Hood",
  "Family Promise",
  "Shepherd's Way",
  "Wichita Recovery Hub",
  "Empower North End",
  "Build & Rebuild",
  "Hope CDC",
] as const;

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
