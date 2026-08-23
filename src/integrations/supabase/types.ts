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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_security_finding_acks: {
        Row: {
          acknowledged_at: string
          admin_id: string
          finding_id: string
          id: string
        }
        Insert: {
          acknowledged_at?: string
          admin_id: string
          finding_id: string
          id?: string
        }
        Update: {
          acknowledged_at?: string
          admin_id?: string
          finding_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_security_finding_acks_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "admin_security_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_security_findings: {
        Row: {
          created_at: string
          fixed_at: string | null
          id: string
          internal_id: string
          scanner_name: string
          severity: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fixed_at?: string | null
          id?: string
          internal_id: string
          scanner_name: string
          severity?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fixed_at?: string | null
          id?: string
          internal_id?: string
          scanner_name?: string
          severity?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      analytics_events_archive: {
        Row: {
          archived_at: string
          created_at: string
          event_data: Json | null
          event_name: string
          id: string
          page_path: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          archived_at?: string
          created_at: string
          event_data?: Json | null
          event_name: string
          id: string
          page_path?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          archived_at?: string
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
      data_retention_job_log: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_name: string
          rows_archived: number | null
          rows_deleted: number | null
          rows_expected: number | null
          rows_obfuscated: number | null
          started_at: string
          status: string
          validation_status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_name: string
          rows_archived?: number | null
          rows_deleted?: number | null
          rows_expected?: number | null
          rows_obfuscated?: number | null
          started_at?: string
          status?: string
          validation_status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_name?: string
          rows_archived?: number | null
          rows_deleted?: number | null
          rows_expected?: number | null
          rows_obfuscated?: number | null
          started_at?: string
          status?: string
          validation_status?: string | null
        }
        Relationships: []
      }
      deal_ending_soon_notified: {
        Row: {
          deal_id: string
          notified_at: string
        }
        Insert: {
          deal_id: string
          notified_at?: string
        }
        Update: {
          deal_id?: string
          notified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_ending_soon_notified_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
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
          merchant_id: string | null
          neighborhood_id: string | null
          onboarding_completed_at: string | null
          onboarding_started_at: string | null
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
          merchant_id?: string | null
          neighborhood_id?: string | null
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
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
          merchant_id?: string | null
          neighborhood_id?: string | null
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
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
      email_notification_throttle: {
        Row: {
          channel_key: string
          created_at: string
          id: string
          last_sent_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_key: string
          created_at?: string
          id?: string
          last_sent_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_key?: string
          created_at?: string
          id?: string
          last_sent_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_queue_alerts: {
        Row: {
          created_at: string
          id: string
          message: string
          metric: string
          observed_value: number
          queue_name: string
          resolved_at: string | null
          severity: string
          status: string
          threshold_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metric: string
          observed_value: number
          queue_name: string
          resolved_at?: string | null
          severity: string
          status?: string
          threshold_value: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metric?: string
          observed_value?: number
          queue_name?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          threshold_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_queue_thresholds: {
        Row: {
          crit_value: number
          enabled: boolean
          metric: string
          updated_at: string
          warn_value: number
        }
        Insert: {
          crit_value: number
          enabled?: boolean
          metric: string
          updated_at?: string
          warn_value: number
        }
        Update: {
          crit_value?: number
          enabled?: boolean
          metric?: string
          updated_at?: string
          warn_value?: number
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      location_permission_events: {
        Row: {
          created_at: string
          detail: string | null
          duration_ms: number | null
          fallback_used: boolean
          id: string
          method: string | null
          outcome: string
          platform: string
          prompt_suppressed: boolean
          surface: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          duration_ms?: number | null
          fallback_used?: boolean
          id?: string
          method?: string | null
          outcome: string
          platform?: string
          prompt_suppressed?: boolean
          surface?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          duration_ms?: number | null
          fallback_used?: boolean
          id?: string
          method?: string | null
          outcome?: string
          platform?: string
          prompt_suppressed?: boolean
          surface?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      location_tracking_diagnostics: {
        Row: {
          background_enabled: boolean | null
          created_at: string
          last_error: string | null
          last_error_at: string | null
          last_skip_at: string | null
          last_skip_reason: string | null
          last_write_at: string | null
          last_write_source: string | null
          permission_checked_at: string | null
          permission_state: string | null
          platform: string | null
          prompt_outcome: string | null
          prompt_outcome_at: string | null
          tracker_started_at: string | null
          tracking_enabled: boolean | null
          updated_at: string
          user_id: string
          write_count: number
        }
        Insert: {
          background_enabled?: boolean | null
          created_at?: string
          last_error?: string | null
          last_error_at?: string | null
          last_skip_at?: string | null
          last_skip_reason?: string | null
          last_write_at?: string | null
          last_write_source?: string | null
          permission_checked_at?: string | null
          permission_state?: string | null
          platform?: string | null
          prompt_outcome?: string | null
          prompt_outcome_at?: string | null
          tracker_started_at?: string | null
          tracking_enabled?: boolean | null
          updated_at?: string
          user_id: string
          write_count?: number
        }
        Update: {
          background_enabled?: boolean | null
          created_at?: string
          last_error?: string | null
          last_error_at?: string | null
          last_skip_at?: string | null
          last_skip_reason?: string | null
          last_write_at?: string | null
          last_write_source?: string | null
          permission_checked_at?: string | null
          permission_state?: string | null
          platform?: string | null
          prompt_outcome?: string | null
          prompt_outcome_at?: string | null
          tracker_started_at?: string | null
          tracking_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          write_count?: number
        }
        Relationships: []
      }
      map_data_pulse: {
        Row: {
          id: boolean
          point_count: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          point_count?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          point_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      map_sync_latency_alerts: {
        Row: {
          created_at: string
          id: string
          message: string
          notified_at: string | null
          observed_p95_ms: number
          resolved_at: string | null
          sample_count: number
          severity: string
          stage: string
          status: string
          threshold_ms: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          notified_at?: string | null
          observed_p95_ms: number
          resolved_at?: string | null
          sample_count: number
          severity: string
          stage: string
          status?: string
          threshold_ms: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          notified_at?: string | null
          observed_p95_ms?: number
          resolved_at?: string | null
          sample_count?: number
          severity?: string
          stage?: string
          status?: string
          threshold_ms?: number
          updated_at?: string
        }
        Relationships: []
      }
      map_sync_latency_samples: {
        Row: {
          created_at: string
          detail: Json
          id: string
          latency_ms: number
          layer: string
          stage: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          latency_ms: number
          layer?: string
          stage: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          latency_ms?: number
          layer?: string
          stage?: string
          user_id?: string | null
        }
        Relationships: []
      }
      map_sync_latency_thresholds: {
        Row: {
          crit_ms: number
          enabled: boolean
          min_samples: number
          min_users: number
          stage: string
          updated_at: string
          warn_ms: number
        }
        Insert: {
          crit_ms: number
          enabled?: boolean
          min_samples?: number
          min_users?: number
          stage: string
          updated_at?: string
          warn_ms: number
        }
        Update: {
          crit_ms?: number
          enabled?: boolean
          min_samples?: number
          min_users?: number
          stage?: string
          updated_at?: string
          warn_ms?: number
        }
        Relationships: []
      }
      marketing_audience_sync_log: {
        Row: {
          audience_id: string
          created_at: string
          details: Json | null
          failed_count: number
          id: string
          removed_count: number
          synced_count: number
        }
        Insert: {
          audience_id: string
          created_at?: string
          details?: Json | null
          failed_count?: number
          id?: string
          removed_count?: number
          synced_count?: number
        }
        Update: {
          audience_id?: string
          created_at?: string
          details?: Json | null
          failed_count?: number
          id?: string
          removed_count?: number
          synced_count?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          deal_id: string | null
          id: string
          image_url: string | null
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          deal_id?: string | null
          id?: string
          image_url?: string | null
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          deal_id?: string | null
          id?: string
          image_url?: string | null
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      native_push_audit: {
        Row: {
          attempted_at: string
          audience: string | null
          category: string | null
          created_at: string
          error: string | null
          event_type: string | null
          http_status: number | null
          id: string
          platform: string
          provider_message_id: string | null
          queue_id: string | null
          status: string
          subscription_id: string | null
          token_tail: string | null
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          audience?: string | null
          category?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string
          platform?: string
          provider_message_id?: string | null
          queue_id?: string | null
          status: string
          subscription_id?: string | null
          token_tail?: string | null
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          audience?: string | null
          category?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string
          platform?: string
          provider_message_id?: string | null
          queue_id?: string | null
          status?: string
          subscription_id?: string | null
          token_tail?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "native_push_audit_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "notification_queue"
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
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          opened_at: string | null
          queue_id: string
          status: string
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          opened_at?: string | null
          queue_id: string
          status?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          opened_at?: string | null
          queue_id?: string
          status?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "notification_queue"
            referencedColumns: ["id"]
          },
        ]
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
      notification_queue: {
        Row: {
          attempts: number
          audience: string
          body: string
          category: string
          created_at: string
          data: Json
          deal_id: string | null
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          neighborhood_id: string | null
          processed_at: string | null
          scheduled_at: string
          source: string
          stats: Json
          status: string
          target_user_ids: string[] | null
          title: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          attempts?: number
          audience?: string
          body: string
          category?: string
          created_at?: string
          data?: Json
          deal_id?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          neighborhood_id?: string | null
          processed_at?: string | null
          scheduled_at?: string
          source?: string
          stats?: Json
          status?: string
          target_user_ids?: string[] | null
          title: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          attempts?: number
          audience?: string
          body?: string
          category?: string
          created_at?: string
          data?: Json
          deal_id?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          neighborhood_id?: string | null
          processed_at?: string | null
          scheduled_at?: string
          source?: string
          stats?: Json
          status?: string
          target_user_ids?: string[] | null
          title?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_neighborhood_id_fkey"
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
          display_name_claimed: boolean
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
          display_name_claimed?: boolean
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
          display_name_claimed?: boolean
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
      push_notification_audit: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          endpoint_tail: string | null
          id: string
          platform: string | null
          source: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          endpoint_tail?: string | null
          id?: string
          platform?: string | null
          source: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          endpoint_tail?: string | null
          id?: string
          platform?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      push_notifications: {
        Row: {
          active: boolean | null
          auth_key: string
          created_at: string | null
          device_id: string | null
          endpoint: string
          id: string
          p256dh_key: string
          platform: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          auth_key: string
          created_at?: string | null
          device_id?: string | null
          endpoint: string
          id?: string
          p256dh_key: string
          platform?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          auth_key?: string
          created_at?: string | null
          device_id?: string | null
          endpoint?: string
          id?: string
          p256dh_key?: string
          platform?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      realtime_guard_alerts: {
        Row: {
          check_name: string
          created_at: string
          detail: Json
          id: string
          message: string
          resolved_at: string | null
          severity: string
          status: string
          target: string
          updated_at: string
        }
        Insert: {
          check_name: string
          created_at?: string
          detail?: Json
          id?: string
          message: string
          resolved_at?: string | null
          severity: string
          status?: string
          target: string
          updated_at?: string
        }
        Update: {
          check_name?: string
          created_at?: string
          detail?: Json
          id?: string
          message?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          target?: string
          updated_at?: string
        }
        Relationships: []
      }
      realtime_guard_allowlist: {
        Row: {
          allow_replica_identity_full: boolean
          created_at: string
          note: string | null
          sensitivity: string
          table_name: string
        }
        Insert: {
          allow_replica_identity_full?: boolean
          created_at?: string
          note?: string | null
          sensitivity: string
          table_name: string
        }
        Update: {
          allow_replica_identity_full?: boolean
          created_at?: string
          note?: string | null
          sensitivity?: string
          table_name?: string
        }
        Relationships: []
      }
      retention_settings: {
        Row: {
          created_at: string
          cron_schedule: string
          id: boolean
          live_retention_days: number
          obfuscate_after_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          cron_schedule?: string
          id?: boolean
          live_retention_days?: number
          obfuscate_after_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          cron_schedule?: string
          id?: boolean
          live_retention_days?: number
          obfuscate_after_days?: number
          updated_at?: string
          updated_by?: string | null
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
      security_finding_alerts: {
        Row: {
          alert_type: string
          finding_id: string
          id: string
          internal_id: string
          notified_at: string
          scanner_name: string
          severity: string
          status: string
        }
        Insert: {
          alert_type: string
          finding_id: string
          id?: string
          internal_id: string
          notified_at?: string
          scanner_name: string
          severity: string
          status: string
        }
        Update: {
          alert_type?: string
          finding_id?: string
          id?: string
          internal_id?: string
          notified_at?: string
          scanner_name?: string
          severity?: string
          status?: string
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          email: string
          id: string
          product_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscribed: boolean
          subscription_end: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          email: string
          id?: string
          product_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          email?: string
          id?: string
          product_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      user_consents: {
        Row: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at: string
          granted: boolean
          granted_at: string | null
          id: string
          policy_version: string
          revoked_at: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          granted: boolean
          granted_at?: string | null
          id?: string
          policy_version?: string
          revoked_at?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          consent_type?: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          id?: string
          policy_version?: string
          revoked_at?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          deal_id: string | null
          id: string
          user_id: string
          venue_address: string | null
          venue_category: string | null
          venue_id: string | null
          venue_image_url: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_name: string | null
          venue_neighborhood: string | null
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          id?: string
          user_id: string
          venue_address?: string | null
          venue_category?: string | null
          venue_id?: string | null
          venue_image_url?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
          venue_neighborhood?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          id?: string
          user_id?: string
          venue_address?: string | null
          venue_category?: string | null
          venue_id?: string | null
          venue_image_url?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
          venue_neighborhood?: string | null
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
      user_locations_archive: {
        Row: {
          accuracy: number | null
          archived_at: string
          created_at: string
          current_neighborhood_id: string | null
          id: string
          latitude: number
          longitude: number
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          archived_at?: string
          created_at: string
          current_neighborhood_id?: string | null
          id: string
          latitude: number
          longitude: number
          user_id: string
        }
        Update: {
          accuracy?: number | null
          archived_at?: string
          created_at?: string
          current_neighborhood_id?: string | null
          id?: string
          latitude?: number
          longitude?: number
          user_id?: string
        }
        Relationships: []
      }
      user_notification_settings: {
        Row: {
          categories: Json
          created_at: string
          quiet_hours_enabled: boolean
          quiet_hours_end: number
          quiet_hours_start: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categories?: Json
          created_at?: string
          quiet_hours_enabled?: boolean
          quiet_hours_end?: number
          quiet_hours_start?: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          categories?: Json
          created_at?: string
          quiet_hours_enabled?: boolean
          quiet_hours_end?: number
          quiet_hours_start?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          auto_reload_updates: boolean
          background_tracking_enabled: boolean
          created_at: string | null
          email_notifications_enabled: boolean
          id: string
          location_tracking_enabled: boolean
          marketing_consent_updated_at: string | null
          marketing_emails_enabled: boolean
          notifications_enabled: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_reload_updates?: boolean
          background_tracking_enabled?: boolean
          created_at?: string | null
          email_notifications_enabled?: boolean
          id?: string
          location_tracking_enabled?: boolean
          marketing_consent_updated_at?: string | null
          marketing_emails_enabled?: boolean
          notifications_enabled?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_reload_updates?: boolean
          background_tracking_enabled?: boolean
          created_at?: string | null
          email_notifications_enabled?: boolean
          id?: string
          location_tracking_enabled?: boolean
          marketing_consent_updated_at?: string | null
          marketing_emails_enabled?: boolean
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
      admin_list_user_emails: {
        Args: never
        Returns: {
          email: string
          id: string
        }[]
      }
      admin_user_directory: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          email_confirmed_at: string
          has_profile: boolean
          id: string
          last_sign_in_at: string
          onboarding_completed: boolean
        }[]
      }
      admin_user_sync_status: {
        Args: never
        Returns: {
          auth_users: number
          missing_preferences: number
          missing_profiles: number
          orphan_profiles: number
          preferences: number
          profiles: number
        }[]
      }
      apply_retention_schedule: { Args: never; Returns: undefined }
      can_view_profile_field: {
        Args: { _field_name: string; _profile_id: string; _viewer_id: string }
        Returns: boolean
      }
      check_connection_rate_limit: {
        Args: { _user_id: string }
        Returns: boolean
      }
      check_email_queue_health: {
        Args: never
        Returns: {
          opened: number
          resolved: number
        }[]
      }
      check_map_sync_latency: {
        Args: never
        Returns: {
          opened: number
          resolved: number
        }[]
      }
      check_realtime_guard: {
        Args: never
        Returns: {
          opened: number
          resolved: number
        }[]
      }
      claim_notification_batch: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          audience: string
          body: string
          category: string
          created_at: string
          data: Json
          deal_id: string | null
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          neighborhood_id: string | null
          processed_at: string | null
          scheduled_at: string
          source: string
          stats: Json
          status: string
          target_user_ids: string[] | null
          title: string
          updated_at: string
          venue_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_push_subscription: {
        Args: {
          _auth: string
          _endpoint: string
          _p256dh: string
          _platform?: string
        }
        Returns: undefined
      }
      cleanup_old_analytics_events: { Args: never; Returns: undefined }
      cleanup_old_search_history: { Args: never; Returns: undefined }
      cleanup_old_security_audit_logs: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dispatch_ending_soon_favorites: { Args: never; Returns: undefined }
      dispatch_notification_queue: { Args: never; Returns: undefined }
      display_name_available: { Args: { _name: string }; Returns: boolean }
      email_queue_dispatch: { Args: never; Returns: undefined }
      email_queue_endpoint: { Args: never; Returns: string }
      email_queue_metrics: {
        Args: never
        Returns: {
          dlq_depth: number
          newest_message_age_seconds: number
          processing_lag_seconds: number
          queue_depth: number
          queue_name: string
          total_enqueued: number
        }[]
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_email_queue_triggers: { Args: never; Returns: undefined }
      generate_auto_handle: { Args: { _user_id: string }; Returns: string }
      get_user_id_by_email: { Args: { _email: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoke_favorite_update_notify: {
        Args: { _deal_id: string; _event_type: string; _venue_id: string }
        Returns: undefined
      }
      map_sync_latency_metrics: {
        Args: { _window_minutes?: number }
        Returns: {
          max_ms: number
          newest_at: string
          p50_ms: number
          p95_ms: number
          samples: number
          stage: string
          users: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      obfuscate_coordinates: {
        Args: { lat: number; lng: number }
        Returns: {
          obfuscated_lat: number
          obfuscated_lng: number
        }[]
      }
      process_location_data_retention: { Args: never; Returns: undefined }
      profiles_visible: {
        Args: never
        Returns: {
          avatar_url: string
          bio: string
          birthdate: string
          created_at: string
          discoverable: boolean
          display_name: string
          facebook_url: string
          gender: string
          id: string
          instagram_url: string
          linkedin_url: string
          onboarding_completed: boolean
          pronouns: string
          tiktok_url: string
          twitter_url: string
          updated_at: string
        }[]
      }
      raise_realtime_alert: {
        Args: {
          _check: string
          _detail: Json
          _msg: string
          _sev: string
          _target: string
        }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      realtime_publication_audit: {
        Args: never
        Returns: {
          approved: boolean
          replica_identity: string
          replica_identity_acknowledged: boolean
          rls_enabled: boolean
          sensitivity: string
          table_name: string
          unscoped_select_policies: string[]
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      consent_type:
        | "foreground_location"
        | "background_tracking"
        | "push_notifications"
        | "messaging_analytics"
        | "marketing_email"
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
      consent_type: [
        "foreground_location",
        "background_tracking",
        "push_notifications",
        "messaging_analytics",
        "marketing_email",
      ],
    },
  },
} as const
