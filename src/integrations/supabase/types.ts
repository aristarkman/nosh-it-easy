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
      abandoned_carts: {
        Row: {
          created_at: string
          customer_name: string | null
          email: string | null
          id: string
          item_count: number
          items: Json
          last_activity_at: string
          location_id: string | null
          marketing_email_opt_in: boolean
          marketing_sms_opt_in: boolean
          order_type: string | null
          phone: string | null
          recovered: boolean
          recovered_order_id: string | null
          reminded_email_at: string | null
          reminded_sms_at: string | null
          session_id: string
          subtotal: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          email?: string | null
          id?: string
          item_count?: number
          items?: Json
          last_activity_at?: string
          location_id?: string | null
          marketing_email_opt_in?: boolean
          marketing_sms_opt_in?: boolean
          order_type?: string | null
          phone?: string | null
          recovered?: boolean
          recovered_order_id?: string | null
          reminded_email_at?: string | null
          reminded_sms_at?: string | null
          session_id: string
          subtotal?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          email?: string | null
          id?: string
          item_count?: number
          items?: Json
          last_activity_at?: string
          location_id?: string | null
          marketing_email_opt_in?: boolean
          marketing_sms_opt_in?: boolean
          order_type?: string | null
          phone?: string | null
          recovered?: boolean
          recovered_order_id?: string | null
          reminded_email_at?: string | null
          reminded_sms_at?: string | null
          session_id?: string
          subtotal?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          location_id: string | null
          order_type: string | null
          properties: Json
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          location_id?: string | null
          order_type?: string | null
          properties?: Json
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          location_id?: string | null
          order_type?: string | null
          properties?: Json
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      biyo_locations: {
        Row: {
          biyo_store_id: string
          created_at: string
          display_name: string | null
          location_id: string
          updated_at: string
        }
        Insert: {
          biyo_store_id: string
          created_at?: string
          display_name?: string | null
          location_id: string
          updated_at?: string
        }
        Update: {
          biyo_store_id?: string
          created_at?: string
          display_name?: string | null
          location_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          created_at: string
          delivery_notes: string | null
          id: string
          is_default: boolean
          label: string
          state: string
          updated_at: string
          user_id: string
          zip: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          created_at?: string
          delivery_notes?: string | null
          id?: string
          is_default?: boolean
          label?: string
          state: string
          updated_at?: string
          user_id: string
          zip: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          created_at?: string
          delivery_notes?: string | null
          id?: string
          is_default?: boolean
          label?: string
          state?: string
          updated_at?: string
          user_id?: string
          zip?: string
        }
        Relationships: []
      }
      customer_favorites: {
        Row: {
          created_at: string
          id: string
          items: Json
          location_id: string
          name: string
          order_type: string
          source_order_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items: Json
          location_id: string
          name: string
          order_type: string
          source_order_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          location_id?: string
          name?: string
          order_type?: string
          source_order_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          marketing_email: boolean
          marketing_sms: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          marketing_email?: boolean
          marketing_sms?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          marketing_email?: boolean
          marketing_sms?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_zone_polygons: {
        Row: {
          active: boolean
          color: string
          created_at: string
          fee: number
          id: string
          location_id: string
          minimum: number
          name: string
          polygon: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          fee?: number
          id?: string
          location_id: string
          minimum?: number
          name: string
          polygon: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          fee?: number
          id?: string
          location_id?: string
          minimum?: number
          name?: string
          polygon?: Json
          sort_order?: number
          updated_at?: string
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
      loyalty_ledger: {
        Row: {
          created_at: string
          id: string
          kind: string
          note: string | null
          order_id: string | null
          points: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          order_id?: string | null
          points: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          order_id?: string | null
          points?: number
          user_id?: string
        }
        Relationships: []
      }
      loyalty_redemptions: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string | null
          points_used: number
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          points_used?: number
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          points_used?: number
          user_id?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          active: boolean
          blurb: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          blurb?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          blurb?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      menu_item_availability: {
        Row: {
          location_id: string
          menu_item_id: string
          sold_out: boolean
          updated_at: string
        }
        Insert: {
          location_id: string
          menu_item_id: string
          sold_out?: boolean
          updated_at?: string
        }
        Update: {
          location_id?: string
          menu_item_id?: string
          sold_out?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_availability_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "biyo_locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "menu_item_availability_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_modifier_groups: {
        Row: {
          menu_item_id: string
          modifier_group_id: string
          sort_order: number
        }
        Insert: {
          menu_item_id: string
          modifier_group_id: string
          sort_order?: number
        }
        Update: {
          menu_item_id?: string
          modifier_group_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifier_groups_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_modifiers: {
        Row: {
          groups: Json
          menu_item_id: string
          updated_at: string
        }
        Insert: {
          groups?: Json
          menu_item_id: string
          updated_at?: string
        }
        Update: {
          groups?: Json
          menu_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifiers_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: true
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_photos: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_photos_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_prices: {
        Row: {
          location_id: string
          menu_item_id: string
          price: number
          synced_at: string
        }
        Insert: {
          location_id: string
          menu_item_id: string
          price?: number
          synced_at?: string
        }
        Update: {
          location_id?: string
          menu_item_id?: string
          price?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_prices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "biyo_locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "menu_item_prices_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          biyo_product_id: string
          category: string | null
          created_at: string
          description: string | null
          gluten_free_possible: boolean
          id: string
          last_synced_at: string | null
          name: string
          photo_url: string | null
          popular: boolean
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          biyo_product_id: string
          category?: string | null
          created_at?: string
          description?: string | null
          gluten_free_possible?: boolean
          id?: string
          last_synced_at?: string | null
          name: string
          photo_url?: string | null
          popular?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          biyo_product_id?: string
          category?: string | null
          created_at?: string
          description?: string | null
          gluten_free_possible?: boolean
          id?: string
          last_synced_at?: string | null
          name?: string
          photo_url?: string | null
          popular?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      menu_sync_log: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          items_upserted: number | null
          prices_upserted: number | null
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          items_upserted?: number | null
          prices_upserted?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          items_upserted?: number | null
          prices_upserted?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      modifier_groups: {
        Row: {
          created_at: string
          id: string
          max_select: number
          min_select: number
          name: string
          required: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          name: string
          required?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          name?: string
          required?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      modifier_options: {
        Row: {
          created_at: string
          group_id: string
          id: string
          name: string
          price_delta: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          name: string
          price_delta?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          name?: string
          price_delta?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "modifier_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          ipospays_reference: string | null
          items_refunded: Json | null
          location_id: string
          order_id: string
          reason: string
          reason_notes: string | null
          refunded_by: string | null
          refunded_by_email: string | null
          status: Database["public"]["Enums"]["refund_status"]
          type: Database["public"]["Enums"]["refund_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          ipospays_reference?: string | null
          items_refunded?: Json | null
          location_id: string
          order_id: string
          reason: string
          reason_notes?: string | null
          refunded_by?: string | null
          refunded_by_email?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          type: Database["public"]["Enums"]["refund_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          ipospays_reference?: string | null
          items_refunded?: Json | null
          location_id?: string
          order_id?: string
          reason?: string
          reason_notes?: string | null
          refunded_by?: string | null
          refunded_by_email?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          type?: Database["public"]["Enums"]["refund_type"]
        }
        Relationships: []
      }
      orders: {
        Row: {
          card_fee: number
          channel: Database["public"]["Enums"]["order_channel"]
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
          quoted_delivery_fee: number | null
          refund_status: Database["public"]["Enums"]["order_refund_state"]
          refunded_total: number
          scheduled_time: string | null
          shipday_order_id: string | null
          shipday_tracking_url: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string | null
          when_type: string
        }
        Insert: {
          card_fee?: number
          channel?: Database["public"]["Enums"]["order_channel"]
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
          quoted_delivery_fee?: number | null
          refund_status?: Database["public"]["Enums"]["order_refund_state"]
          refunded_total?: number
          scheduled_time?: string | null
          shipday_order_id?: string | null
          shipday_tracking_url?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax?: number
          total: number
          updated_at?: string
          user_id?: string | null
          when_type?: string
        }
        Update: {
          card_fee?: number
          channel?: Database["public"]["Enums"]["order_channel"]
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
          quoted_delivery_fee?: number | null
          refund_status?: Database["public"]["Enums"]["order_refund_state"]
          refunded_total?: number
          scheduled_time?: string | null
          shipday_order_id?: string | null
          shipday_tracking_url?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          user_id?: string | null
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
      promo_codes: {
        Row: {
          active: boolean
          bogo_buy_item_id: string | null
          bogo_get_item_id: string | null
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          max_total_uses: number | null
          max_uses_per_customer: number
          min_subtotal: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          bogo_buy_item_id?: string | null
          bogo_get_item_id?: string | null
          code: string
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          max_total_uses?: number | null
          max_uses_per_customer?: number
          min_subtotal?: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          bogo_buy_item_id?: string | null
          bogo_get_item_id?: string | null
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          max_total_uses?: number | null
          max_uses_per_customer?: number
          min_subtotal?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          created_at: string
          customer_phone: string | null
          discount_amount: number
          id: string
          order_id: string | null
          promo_code_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_phone?: string | null
          discount_amount?: number
          id?: string
          order_id?: string | null
          promo_code_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_phone?: string | null
          discount_amount?: number
          id?: string
          order_id?: string | null
          promo_code_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
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
          hours_kind: string
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
          hours_kind?: string
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
          hours_kind?: string
          id?: string
          is_closed?: boolean
          location_id?: string
          open_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          details: Json | null
          id: string
          kind: string
          location_id: string | null
          message: string
          order_id: string | null
          order_number: string | null
          severity: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          kind: string
          location_id?: string | null
          message: string
          order_id?: string | null
          order_number?: string | null
          severity?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          kind?: string
          location_id?: string | null
          message?: string
          order_id?: string | null
          order_number?: string | null
          severity?: string
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
      loyalty_balance: { Args: { _user_id: string }; Returns: number }
      user_has_location: {
        Args: { _location_id: string; _user_id: string }
        Returns: boolean
      }
      validate_promo: {
        Args: {
          _code: string
          _customer_phone: string
          _item_ids: string[]
          _subtotal: number
          _user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "staff"
      delivery_status:
        | "unassigned"
        | "assigned"
        | "out_for_delivery"
        | "delivered"
      order_channel: "web" | "tablet" | "phone" | "third_party"
      order_refund_state: "none" | "partial" | "full" | "voided"
      order_status: "new" | "accepted" | "ready" | "completed" | "cancelled"
      order_type: "pickup" | "delivery"
      refund_status: "recorded" | "failed" | "pending"
      refund_type: "full" | "partial" | "void"
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
      order_channel: ["web", "tablet", "phone", "third_party"],
      order_refund_state: ["none", "partial", "full", "voided"],
      order_status: ["new", "accepted", "ready", "completed", "cancelled"],
      order_type: ["pickup", "delivery"],
      refund_status: ["recorded", "failed", "pending"],
      refund_type: ["full", "partial", "void"],
    },
  },
} as const
