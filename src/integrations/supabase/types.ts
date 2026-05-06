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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      delivery_zones: {
        Row: {
          created_at: string
          fee: number
          id: string
          location_id: string
          minimum: number
          zip: string
        }
        Insert: {
          created_at?: string
          fee?: number
          id?: string
          location_id: string
          minimum?: number
          zip: string
        }
        Update: {
          created_at?: string
          fee?: number
          id?: string
          location_id?: string
          minimum?: number
          zip?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          location_id: string
          name: string
          phone: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          location_id: string
          name: string
          phone?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      location_throttle: {
        Row: {
          delivery_lead_min: number
          location_id: string
          max_orders_per_15min: number
          pickup_lead_min: number
          updated_at: string
        }
        Insert: {
          delivery_lead_min?: number
          location_id: string
          max_orders_per_15min?: number
          pickup_lead_min?: number
          updated_at?: string
        }
        Update: {
          delivery_lead_min?: number
          location_id?: string
          max_orders_per_15min?: number
          pickup_lead_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          card_fee: number
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee: number
          delivery_status: Database["public"]["Enums"]["delivery_status"] | null
          dispatched_at: string | null
          driver_id: string | null
          id: string
          items: Json
          location_id: string
          notes: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          scheduled_time: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          when_type: string
        }
        Insert: {
          card_fee?: number
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_status?:
            | Database["public"]["Enums"]["delivery_status"]
            | null
          dispatched_at?: string | null
          driver_id?: string | null
          id?: string
          items: Json
          location_id: string
          notes?: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: string
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax?: number
          total: number
          updated_at?: string
          when_type?: string
        }
        Update: {
          card_fee?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_status?:
            | Database["public"]["Enums"]["delivery_status"]
            | null
          dispatched_at?: string | null
          driver_id?: string | null
          id?: string
          items?: Json
          location_id?: string
          notes?: string | null
          order_number?: string
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_method?: string
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          when_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_locations: {
        Row: {
          created_at: string
          id: string
          location_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          user_id?: string
        }
        Relationships: []
      }
      store_closures: {
        Row: {
          created_at: string
          end_date: string
          id: string
          location_id: string | null
          reason: string | null
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          location_id?: string | null
          reason?: string | null
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          location_id?: string | null
          reason?: string | null
          start_date?: string
        }
        Relationships: []
      }
      store_hours: {
        Row: {
          close_time: string | null
          created_at: string
          day_of_week: number
          id: string
          is_closed: boolean
          location_id: string
          open_time: string | null
          updated_at: string
        }
        Insert: {
          close_time?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_closed?: boolean
          location_id: string
          open_time?: string | null
          updated_at?: string
        }
        Update: {
          close_time?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean
          location_id?: string
          open_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_locations: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_has_location: {
        Args: { _location_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff"
      delivery_status:
        | "unassigned"
        | "assigned"
        | "out_for_delivery"
        | "delivered"
      order_status: "new" | "accepted" | "ready" | "completed" | "cancelled"
      order_type: "pickup" | "delivery"
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
      app_role: ["admin", "staff"],
      delivery_status: [
        "unassigned",
        "assigned",
        "out_for_delivery",
        "delivered",
      ],
      order_status: ["new", "accepted", "ready", "completed", "cancelled"],
      order_type: ["pickup", "delivery"],
    },
  },
} as const
