export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: "rider" | "driver";
          friend_code: string;
          invite_token: string;
          disclaimer_accepted: boolean;
          disclaimer_accepted_at: string | null;
          is_admin: boolean;
          phone: string | null;
          notify_email: boolean;
          organization: string | null;
          pending_organizations: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: "rider" | "driver";
          phone?: string | null;
          notify_email?: boolean;
          friend_code: string;
          invite_token: string;
          disclaimer_accepted?: boolean;
          disclaimer_accepted_at?: string | null;
          is_admin?: boolean;
          organization?: string | null;
          pending_organizations?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: "rider" | "driver";
          phone?: string | null;
          notify_email?: boolean;
          friend_code?: string;
          invite_token?: string;
          disclaimer_accepted?: boolean;
          disclaimer_accepted_at?: string | null;
          is_admin?: boolean;
          organization?: string | null;
          pending_organizations?: string | null;
          updated_at?: string;
        };
      };
      connections: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: "pending" | "accepted" | "declined";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: "pending" | "accepted" | "declined";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "pending" | "accepted" | "declined";
          updated_at?: string;
        };
      };
      ride_requests: {
        Row: {
          id: string;
          rider_id: string;
          pickup_address: string;
          pickup_place_id: string | null;
          pickup_lat: number | null;
          pickup_lng: number | null;
          dropoff_address: string;
          dropoff_place_id: string | null;
          dropoff_lat: number | null;
          dropoff_lng: number | null;
          ride_date: string;
          ride_time: string;
          is_round_trip: boolean;
          return_time: string | null;
          notes: string | null;
          visibility: "circle" | "organization" | "community";
          status: "open" | "matched" | "completed" | "cancelled";
          matched_offer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rider_id: string;
          pickup_address: string;
          pickup_place_id?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          dropoff_address: string;
          dropoff_place_id?: string | null;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          ride_date: string;
          ride_time: string;
          is_round_trip?: boolean;
          return_time?: string | null;
          notes?: string | null;
          visibility?: "circle" | "organization" | "community";
          status?: "open" | "matched" | "completed" | "cancelled";
          matched_offer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          pickup_address?: string;
          pickup_place_id?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          dropoff_address?: string;
          dropoff_place_id?: string | null;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          ride_date?: string;
          ride_time?: string;
          is_round_trip?: boolean;
          return_time?: string | null;
          notes?: string | null;
          visibility?: "circle" | "organization" | "community";
          status?: "open" | "matched" | "completed" | "cancelled";
          matched_offer_id?: string | null;
          updated_at?: string;
        };
      };
      ride_offers: {
        Row: {
          id: string;
          ride_request_id: string;
          driver_id: string;
          suggested_price: string | null;
          message: string | null;
          status: "pending" | "accepted" | "declined" | "withdrawn";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ride_request_id: string;
          driver_id: string;
          suggested_price?: string | null;
          message?: string | null;
          status?: "pending" | "accepted" | "declined" | "withdrawn";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          suggested_price?: string | null;
          message?: string | null;
          status?: "pending" | "accepted" | "declined" | "withdrawn";
          updated_at?: string;
        };
      };
      message_threads: {
        Row: {
          id: string;
          ride_request_id: string;
          rider_id: string;
          driver_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ride_request_id: string;
          rider_id: string;
          driver_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      messages: {
        Row: {
          id: string;
          thread_id: string;
          sender_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          sender_id: string;
          content: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      vetted_driver_status: {
        Row: {
          id: string;
          user_id: string;
          license_attestation: boolean;
          insurance_attestation: boolean;
          status: "pending" | "approved" | "denied" | "suspended";
          driver_scope: string | null;
          admin_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          license_attestation?: boolean;
          insurance_attestation?: boolean;
          status?: "pending" | "approved" | "denied" | "suspended";
          driver_scope?: string | null;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          license_attestation?: boolean;
          insurance_attestation?: boolean;
          status?: "pending" | "approved" | "denied" | "suspended";
          driver_scope?: string | null;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
        };
      };
      driver_reviews: {
        Row: {
          id: string;
          ride_request_id: string;
          reviewer_id: string;
          driver_id: string;
          rating: number;
          review_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ride_request_id: string;
          reviewer_id: string;
          driver_id: string;
          rating: number;
          review_text?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
    };
    Functions: {
      get_connections: {
        Args: { p_user_id: string };
        Returns: string[];
      };
      get_extended_connections: {
        Args: { p_user_id: string };
        Returns: string[];
      };
      can_see_ride_request: {
        Args: { p_driver_id: string; p_ride_request_id: string };
        Returns: boolean;
      };
    };
  };
}

// Convenience type aliases
export type User = Database["public"]["Tables"]["users"]["Row"];
export type Connection = Database["public"]["Tables"]["connections"]["Row"];
export type RideRequest = Database["public"]["Tables"]["ride_requests"]["Row"];
export type RideOffer = Database["public"]["Tables"]["ride_offers"]["Row"];
export type MessageThread = Database["public"]["Tables"]["message_threads"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type VettedDriverStatus = Database["public"]["Tables"]["vetted_driver_status"]["Row"];
export type DriverReview = Database["public"]["Tables"]["driver_reviews"]["Row"];
