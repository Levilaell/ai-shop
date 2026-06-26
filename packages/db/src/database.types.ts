export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      account_users: {
        Row: {
          account_id: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      compliance_checks: {
        Row: {
          account_id: string
          ai_label_required: boolean
          claims_ok: boolean | null
          created_at: string
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          video_id: string
        }
        Insert: {
          account_id: string
          ai_label_required?: boolean
          claims_ok?: boolean | null
          created_at?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          video_id: string
        }
        Update: {
          account_id?: string
          ai_label_required?: boolean
          claims_ok?: boolean | null
          created_at?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_checks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checks_video_id_account_id_fkey"
            columns: ["video_id", "account_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      performance: {
        Row: {
          account_id: string
          clicks: number
          collected_at: string
          commission_brl: number
          created_at: string
          gmv_brl: number
          id: string
          orders: number
          publication_id: string
          views: number
        }
        Insert: {
          account_id: string
          clicks?: number
          collected_at?: string
          commission_brl?: number
          created_at?: string
          gmv_brl?: number
          id?: string
          orders?: number
          publication_id: string
          views?: number
        }
        Update: {
          account_id?: string
          clicks?: number
          collected_at?: string
          commission_brl?: number
          created_at?: string
          gmv_brl?: number
          id?: string
          orders?: number
          publication_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_publication_id_account_id_fkey"
            columns: ["publication_id", "account_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      pipeline_events: {
        Row: {
          account_id: string
          actor: Database["public"]["Enums"]["pipeline_actor"]
          actor_user_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          from_status: Database["public"]["Enums"]["pipeline_status"] | null
          id: string
          payload: Json
          to_status: Database["public"]["Enums"]["pipeline_status"] | null
        }
        Insert: {
          account_id: string
          actor?: Database["public"]["Enums"]["pipeline_actor"]
          actor_user_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          from_status?: Database["public"]["Enums"]["pipeline_status"] | null
          id?: string
          payload?: Json
          to_status?: Database["public"]["Enums"]["pipeline_status"] | null
        }
        Update: {
          account_id?: string
          actor?: Database["public"]["Enums"]["pipeline_actor"]
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          from_status?: Database["public"]["Enums"]["pipeline_status"] | null
          id?: string
          payload?: Json
          to_status?: Database["public"]["Enums"]["pipeline_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          account_id: string
          affiliate_link: string | null
          affiliate_platform: Database["public"]["Enums"]["affiliate_platform"]
          category: string | null
          commission_pct: number
          created_at: string
          external_ref: string | null
          id: string
          price_brl: number
          score: number | null
          score_breakdown: Json
          status: Database["public"]["Enums"]["pipeline_status"]
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          affiliate_link?: string | null
          affiliate_platform?: Database["public"]["Enums"]["affiliate_platform"]
          category?: string | null
          commission_pct?: number
          created_at?: string
          external_ref?: string | null
          id?: string
          price_brl: number
          score?: number | null
          score_breakdown?: Json
          status?: Database["public"]["Enums"]["pipeline_status"]
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          affiliate_link?: string | null
          affiliate_platform?: Database["public"]["Enums"]["affiliate_platform"]
          category?: string | null
          commission_pct?: number
          created_at?: string
          external_ref?: string | null
          id?: string
          price_brl?: number
          score?: number | null
          score_breakdown?: Json
          status?: Database["public"]["Enums"]["pipeline_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      publications: {
        Row: {
          account_id: string
          affiliate_link_used: string | null
          created_at: string
          id: string
          published_at: string | null
          tiktok_post_url: string | null
          updated_at: string
          video_id: string
        }
        Insert: {
          account_id: string
          affiliate_link_used?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          tiktok_post_url?: string | null
          updated_at?: string
          video_id: string
        }
        Update: {
          account_id?: string
          affiliate_link_used?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          tiktok_post_url?: string | null
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publications_video_id_account_id_fkey"
            columns: ["video_id", "account_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      scripts: {
        Row: {
          account_id: string
          angle: string
          body: string
          created_at: string
          cta: string
          hook: string
          id: string
          model_used: string | null
          product_id: string
          status: Database["public"]["Enums"]["pipeline_status"]
          updated_at: string
          variant_index: number
        }
        Insert: {
          account_id: string
          angle: string
          body: string
          created_at?: string
          cta: string
          hook: string
          id?: string
          model_used?: string | null
          product_id: string
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
          variant_index?: number
        }
        Update: {
          account_id?: string
          angle?: string
          body?: string
          created_at?: string
          cta?: string
          hook?: string
          id?: string
          model_used?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
          variant_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "scripts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_product_id_account_id_fkey"
            columns: ["product_id", "account_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      videos: {
        Row: {
          account_id: string
          avatar_tier: Database["public"]["Enums"]["avatar_tier"]
          cost_usd_actual: number | null
          cost_usd_estimated: number
          created_at: string
          duration_seconds: number | null
          error: string | null
          heygen_job_id: string | null
          id: string
          product_id: string
          retry_count: number
          script_id: string
          status: Database["public"]["Enums"]["pipeline_status"]
          updated_at: string
          video_url: string | null
        }
        Insert: {
          account_id: string
          avatar_tier?: Database["public"]["Enums"]["avatar_tier"]
          cost_usd_actual?: number | null
          cost_usd_estimated?: number
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          heygen_job_id?: string | null
          id?: string
          product_id: string
          retry_count?: number
          script_id: string
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          account_id?: string
          avatar_tier?: Database["public"]["Enums"]["avatar_tier"]
          cost_usd_actual?: number | null
          cost_usd_estimated?: number
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          heygen_job_id?: string | null
          id?: string
          product_id?: string
          retry_count?: number
          script_id?: string
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_product_id_account_id_fkey"
            columns: ["product_id", "account_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "account_id"]
          },
          {
            foreignKeyName: "videos_script_id_account_id_fkey"
            columns: ["script_id", "account_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_account_member: { Args: { p_account_id: string }; Returns: boolean }
      queue_archive: {
        Args: { p_msg_id: number; p_queue: string }
        Returns: boolean
      }
      queue_delete: {
        Args: { p_msg_id: number; p_queue: string }
        Returns: boolean
      }
      queue_read: {
        Args: { p_qty: number; p_queue: string; p_vt: number }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      queue_send: {
        Args: { p_delay?: number; p_msg: Json; p_queue: string }
        Returns: number
      }
    }
    Enums: {
      affiliate_platform: "tiktok_shop" | "amazon" | "shopee"
      avatar_tier: "iii" | "iv"
      pipeline_actor: "system" | "user"
      pipeline_status:
        | "product_candidate"
        | "product_approved"
        | "script_generating"
        | "script_ready"
        | "script_approved"
        | "video_generating"
        | "video_ready"
        | "compliance_review"
        | "ready_to_publish"
        | "published"
        | "tracking"
        | "archived"
        | "rejected"
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
      affiliate_platform: ["tiktok_shop", "amazon", "shopee"],
      avatar_tier: ["iii", "iv"],
      pipeline_actor: ["system", "user"],
      pipeline_status: [
        "product_candidate",
        "product_approved",
        "script_generating",
        "script_ready",
        "script_approved",
        "video_generating",
        "video_ready",
        "compliance_review",
        "ready_to_publish",
        "published",
        "tracking",
        "archived",
        "rejected",
      ],
    },
  },
} as const

