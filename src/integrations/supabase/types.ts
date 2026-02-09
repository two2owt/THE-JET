export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event_data: Json | null
          event_name: string
          id: string
          page_path: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_name: string
          id?: string
          page_path?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_name?: string
          id?: string
          page_path?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      deal_shares: {
        Row: {
          deal_id: string
          id: string
          shared_at: string
          user_id: string
        }
        Insert: {
          deal_id: string
          id?: string
          shared_at?: string
          user_id: string
        }
        Update: {
          deal_id?: string
          id?: string
          shared_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_shares_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          active: boolean | null
          active_days: number[] | null
          created_at: string | null
          deal_type: string
          description: string
          expires_at: string
          id: string
          image_url: string | null
          neighborhood_id: string | null
          starts_at: string
          title: string
          updated_at: string | null
          venue_address: string | null
          venue_id: string
          venue_name: string
          website_url: string | null
        }
        Insert: {
          active?: boolean | null
          active_days?: number[] | null
          created_at?: string | null
          deal_type: string
          description: string
          expires_at: string
          id?: string
          image_url?: string | null
          neighborhood_id?: string | null
          starts_at: string
          title: string
          updated_at?: string | null
          venue_address?: string | null
          venue_id: string
          venue_name: string
          website_url?: string | null
        }
        Update: {
          active?: boolean | null
          active_days?: number[] | null
          created_at?: string | null
          deal_type?: string
          description?: string
          expires_at?: string
          id?: string
          image_url?: string | null
          neighborhood_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string | null
          venue_address?: string | null
          venue_id?: string
          venue_name?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_neighborhood_id_fkey"
            columns: ["neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
        ]
      }
      neighborhoods: {
        Row: {
          active: boolean | null
          boundary_points: Json
          center_lat: number
          center_lng: number
          created_at: string | null
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          boundary_points: Json
          center_lat: number
          center_lng: number
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          boundary_points?: Json
          center_lat?: number
          center_lng?: number
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          deal_id: string | null
          id: string
          message: string
          neighborhood_id: string | null
          notification_type: string
          read: boolean | null
          sent_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          deal_id?: string | null
          id?: string
          message: string
          neighborhood_id?: string | null
          notification_type: string
          read?: boolean | null
          sent_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          deal_id?: string | null
          id?: string
          message?: string
          neighborhood_id?: string | null
          notification_type?: string
          read?: boolean | null
          sent_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_neighborhood_id_fkey"
            columns: ["neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          created_at: string
          data_processing_consent: boolean | null
          data_processing_consent_date: string | null
          discoverable: boolean | null
          display_name: string | null
          facebook_url: string | null
          gender: string | null
          id: string
          instagram_url: string | null
          linkedin_url: string | null
          location_consent_date: string | null
          location_consent_given: boolean | null
          onboarding_completed: boolean | null
          preferences: Json | null
          privacy_settings: Json | null
          pronouns: string | null
          tiktok_url: string | null
          twitter_url: string | null
          updated_at: string
          welcome_email_1_sent: boolean | null
          welcome_email_2_sent: boolean | null
          welcome_email_3_sent: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string
          data_processing_consent?: boolean | null
          data_processing_consent_date?: string | null
          discoverable?: boolean | null
          display_name?: string | null
          facebook_url?: string | null
          gender?: string | null
          id: string
          instagram_url?: string | null
          linkedin_url?: string | null
          location_consent_date?: string | null
          location_consent_given?: boolean | null
          onboarding_completed?: boolean | null
          preferences?: Json | null
          privacy_settings?: Json | null
          pronouns?: string | null
          tiktok_url?: string | null
          twitter_url?: string | null
          updated_at?: string
          welcome_email_1_sent?: boolean | null
          welcome_email_2_sent?: boolean | null
          welcome_email_3_sent?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string
          data_processing_consent?: boolean | null
          data_processing_consent_date?: string | null
          discoverable?: boolean | null
          display_name?: string | null
          facebook_url?: string | null
          gender?: string | null
          id?: string
          instagram_url?: string | null
          linkedin_url?: string | null
          location_consent_date?: string | null
          location_consent_given?: boolean | null
          onboarding_completed?: boolean | null
          preferences?: Json | null
          privacy_settings?: Json | null
          pronouns?: string | null
          tiktok_url?: string | null
          twitter_url?: string | null
          updated_at?: string
          welcome_email_1_sent?: boolean | null
          welcome_email_2_sent?: boolean | null
          welcome_email_3_sent?: boolean | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          active: boolean | null
          auth_key: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh_key: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          auth_key: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh_key: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          auth_key?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh_key?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string
          id: string
          search_query: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          search_query: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          search_query?: string
          user_id?: string
        }
        Relationships: []
      }
      security_audit_logs: {
        Row: {
          client_ip: string
          created_at: string
          details: Json | null
          endpoint: string
          event_type: string
          id: string
          request_count: number | null
          time_window_seconds: number | null
          user_agent: string | null
        }
        Insert: {
          client_ip: string
          created_at?: string
          details?: Json | null
          endpoint: string
          event_type: string
          id?: string
          request_count?: number | null
          time_window_seconds?: number | null
          user_agent?: string | null
        }
        Update: {
          client_ip?: string
          created_at?: string
          details?: Json | null
          endpoint?: string
          event_type?: string
          id?: string
          request_count?: number | null
          time_window_seconds?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      user_connections: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_locations: {
        Row: {
          accuracy: number | null
          created_at: string | null
          current_neighborhood_id: string | null
          id: string
          latitude: number
          longitude: number
          user_id: string | null
        }
        Insert: {
          accuracy?: number | null
          created_at?: string | null
          current_neighborhood_id?: string | null
          id?: string
          latitude: number
          longitude: number
          user_id?: string | null
        }
        Update: {
          accuracy?: number | null
          created_at?: string | null
          current_neighborhood_id?: string | null
          id?: string
          latitude?: number
          longitude?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_locations_current_neighborhood_id_fkey"
            columns: ["current_neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          background_tracking_enabled: boolean
          created_at: string | null
          id: string
          location_tracking_enabled: boolean
          notifications_enabled: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          background_tracking_enabled?: boolean
          created_at?: string | null
          id?: string
          location_tracking_enabled?: boolean
          notifications_enabled?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          background_tracking_enabled?: boolean
          created_at?: string | null
          id?: string
          location_tracking_enabled?: boolean
          notifications_enabled?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venue_reviews: {
        Row: {
          created_at: string
          id: string
          rating: number
          review_text: string | null
          updated_at: string
          user_id: string
          venue_id: string
          venue_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          review_text?: string | null
          updated_at?: string
          user_id: string
          venue_id: string
          venue_name: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          review_text?: string | null
          updated_at?: string
          user_id?: string
          venue_id?: string
          venue_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      discoverable_profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
      profiles_secure: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          created_at: string | null
          discoverable: boolean | null
          display_name: string | null
          facebook_url: string | null
          gender: string | null
          id: string | null
          instagram_url: string | null
          linkedin_url: string | null
          onboarding_completed: boolean | null
          pronouns: string | null
          tiktok_url: string | null
          twitter_url: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: never
          birthdate?: never
          created_at?: string | null
          discoverable?: boolean | null
          display_name?: string | null
          facebook_url?: never
          gender?: never
          id?: string | null
          instagram_url?: never
          linkedin_url?: never
          onboarding_completed?: boolean | null
          pronouns?: never
          tiktok_url?: never
          twitter_url?: never
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: never
          birthdate?: never
          created_at?: string | null
          discoverable?: boolean | null
          display_name?: string | null
          facebook_url?: never
          gender?: never
          id?: string | null
          instagram_url?: never
          linkedin_url?: never
          onboarding_completed?: boolean | null
          pronouns?: never
          tiktok_url?: never
          twitter_url?: never
          updated_at?: string | null
        }
        Relationships: []
      }
      venue_reviews_public: {
        Row: {
          created_at: string | null
          id: string | null
          rating: number | null
          review_text: string | null
          updated_at: string | null
          venue_id: string | null
          venue_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          rating?: number | null
          review_text?: string | null
          updated_at?: string | null
          venue_id?: string | null
          venue_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          rating?: number | null
          review_text?: string | null
          updated_at?: string | null
          venue_id?: string | null
          venue_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_view_profile_field: {
        Args: { _field_name: string; _profile_id: string; _viewer_id: string }
        Returns: boolean
      }
      check_connection_rate_limit: {
        Args: { _user_id: string }
        Returns: boolean
      }
      cleanup_old_search_history: { Args: never; Returns: undefined }
      cleanup_old_security_audit_logs: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      obfuscate_coordinates: {
        Args: { lat: number; lng: number }
        Returns: {
          obfuscated_lat: number
          obfuscated_lng: number
        }[]
      }
      process_location_data_retention: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
