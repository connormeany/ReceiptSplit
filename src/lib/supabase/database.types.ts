export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string
          created_at: string | null
          host_phone: string | null
          restaurant_name: string | null
          host_venmo: string | null
          image_url: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          tip_amount: number | null
          misc_fee: number | null
          group_size: number | null
          status: string | null
        }
        Insert: {
          id?: string
          created_at?: string | null
          host_phone?: string | null
          restaurant_name?: string | null
          host_venmo?: string | null
          image_url?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          tip_amount?: number | null
          misc_fee?: number | null
          group_size?: number | null
          status?: string | null
        }
        Update: {
          id?: string
          created_at?: string | null
          host_phone?: string | null
          restaurant_name?: string | null
          host_venmo?: string | null
          image_url?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          tip_amount?: number | null
          misc_fee?: number | null
          group_size?: number | null
          status?: string | null
        }
        Relationships: []
      }
      items: {
        Row: {
          id: string
          session_id: string | null
          name: string
          price: number
          quantity: number
          sort_order: number | null
        }
        Insert: {
          id?: string
          session_id?: string | null
          name: string
          price: number
          quantity?: number
          sort_order?: number | null
        }
        Update: {
          id?: string
          session_id?: string | null
          name?: string
          price?: number
          quantity?: number
          sort_order?: number | null
        }
        Relationships: []
      }
      people: {
        Row: {
          id: string
          session_id: string | null
          name: string
          color: string
          is_host: boolean | null
          is_done: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          session_id?: string | null
          name: string
          color: string
          is_host?: boolean | null
          is_done?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string | null
          name?: string
          color?: string
          is_host?: boolean | null
          is_done?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      claims: {
        Row: {
          id: string
          item_id: string | null
          person_id: string | null
          split_count: number
          custom_amount: number | null
          custom_fraction: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          item_id?: string | null
          person_id?: string | null
          split_count?: number
          custom_amount?: number | null
          custom_fraction?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          item_id?: string | null
          person_id?: string | null
          split_count?: number
          custom_amount?: number | null
          custom_fraction?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
