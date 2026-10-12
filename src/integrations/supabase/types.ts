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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_interactions: {
        Row: {
          clinic_id: string | null
          created_at: string
          feature: string
          id: string
          related_entity_id: string | null
          related_entity_type: string | null
          request_metadata: Json
          response_metadata: Json
          status: Database["public"]["Enums"]["ai_interaction_status"]
          user_id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          feature: string
          id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          request_metadata?: Json
          response_metadata?: Json
          status?: Database["public"]["Enums"]["ai_interaction_status"]
          user_id: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          feature?: string
          id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          request_metadata?: Json
          response_metadata?: Json
          status?: Database["public"]["Enums"]["ai_interaction_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_interactions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          clinic_id: string | null
          created_at: string
          credits_used: number
          feature: string
          id: string
          period_end: string
          period_start: string
          user_id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          credits_used?: number
          feature: string
          id?: string
          period_end: string
          period_start: string
          user_id: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          credits_used?: number
          feature?: string
          id?: string
          period_end?: string
          period_start?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_type: Database["public"]["Enums"]["appointment_type"]
          clinic_id: string
          created_at: string
          created_by: string | null
          doctor_profile_id: string | null
          id: string
          notes: string | null
          patient_id: string
          reason: string | null
          scheduled_end: string
          scheduled_start: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          appointment_type?: Database["public"]["Enums"]["appointment_type"]
          clinic_id: string
          created_at?: string
          created_by?: string | null
          doctor_profile_id?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          reason?: string | null
          scheduled_end: string
          scheduled_start: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          appointment_type?: Database["public"]["Enums"]["appointment_type"]
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          doctor_profile_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          reason?: string | null
          scheduled_end?: string
          scheduled_start?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_profile_id_fkey"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "doctor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          clinic_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          action: string
          clinic_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          action?: string
          clinic_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_documents: {
        Row: {
          clinic_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string
          requirement_id: string
          review_note: string | null
          review_status: Database["public"]["Enums"]["document_review_status"]
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          requirement_id: string
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["document_review_status"]
          size_bytes: number
          storage_path: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          requirement_id?: string
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["document_review_status"]
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_documents_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_documents_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "document_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_invitations: {
        Row: {
          clinic_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["invitation_status"]
        }
        Insert: {
          clinic_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Update: {
          clinic_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "clinic_invitations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_members: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          joined_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          joined_at?: string | null
          role: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_subscriptions: {
        Row: {
          amount: number
          auto_renew: boolean
          billing_cycle: string
          cancelled_at: string | null
          clinic_scope: string | null
          created_at: string
          currency: string
          id: string
          mandate_authorized_at: string | null
          mandate_status: string | null
          next_billing_date: string | null
          owner_user_id: string
          payment_mandate_id: string | null
          payment_provider: string | null
          plan_id: string
          provider_subscription_id: string | null
          renewal_date: string | null
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          subscription_type: Database["public"]["Enums"]["subscription_type"]
          trial_cancelled_at: string | null
          trial_end_date: string | null
          trial_start_date: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          auto_renew?: boolean
          billing_cycle?: string
          cancelled_at?: string | null
          clinic_scope?: string | null
          created_at?: string
          currency?: string
          id?: string
          mandate_authorized_at?: string | null
          mandate_status?: string | null
          next_billing_date?: string | null
          owner_user_id: string
          payment_mandate_id?: string | null
          payment_provider?: string | null
          plan_id: string
          provider_subscription_id?: string | null
          renewal_date?: string | null
          start_date?: string
          status: Database["public"]["Enums"]["subscription_status"]
          subscription_type: Database["public"]["Enums"]["subscription_type"]
          trial_cancelled_at?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_renew?: boolean
          billing_cycle?: string
          cancelled_at?: string | null
          clinic_scope?: string | null
          created_at?: string
          currency?: string
          id?: string
          mandate_authorized_at?: string | null
          mandate_status?: string | null
          next_billing_date?: string | null
          owner_user_id?: string
          payment_mandate_id?: string | null
          payment_provider?: string | null
          plan_id?: string
          provider_subscription_id?: string | null
          renewal_date?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          subscription_type?: Database["public"]["Enums"]["subscription_type"]
          trial_cancelled_at?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_subscriptions_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_verifications: {
        Row: {
          clinic_id: string
          created_at: string
          cycle: number
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          status: Database["public"]["Enums"]["verification_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          cycle?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          cycle?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_verifications_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_verifications_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          city: string | null
          clinic_code: string
          clinic_type: string | null
          country: string
          created_at: string
          currency: string
          display_name: string
          email: string | null
          id: string
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          onboarding_status: Database["public"]["Enums"]["onboarding_status"]
          onboarding_step: number
          owner_user_id: string
          phone: string | null
          postal_code: string | null
          registration_number: string | null
          representative_name: string | null
          representative_phone: string | null
          state: string | null
          status: Database["public"]["Enums"]["clinic_status"]
          timezone: string
          updated_at: string
          working_hours: Json
        }
        Insert: {
          address?: string | null
          city?: string | null
          clinic_code: string
          clinic_type?: string | null
          country?: string
          created_at?: string
          currency?: string
          display_name: string
          email?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          onboarding_step?: number
          owner_user_id: string
          phone?: string | null
          postal_code?: string | null
          registration_number?: string | null
          representative_name?: string | null
          representative_phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["clinic_status"]
          timezone?: string
          updated_at?: string
          working_hours?: Json
        }
        Update: {
          address?: string | null
          city?: string | null
          clinic_code?: string
          clinic_type?: string | null
          country?: string
          created_at?: string
          currency?: string
          display_name?: string
          email?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          onboarding_step?: number
          owner_user_id?: string
          phone?: string | null
          postal_code?: string | null
          registration_number?: string | null
          representative_name?: string | null
          representative_phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["clinic_status"]
          timezone?: string
          updated_at?: string
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "clinics_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          appointment_id: string | null
          assessment: string | null
          chief_complaint: string | null
          clinic_id: string
          clinical_notes: string | null
          completed_at: string | null
          created_at: string
          doctor_profile_id: string
          follow_up_date: string | null
          follow_up_notes: string | null
          id: string
          patient_id: string
          status: Database["public"]["Enums"]["consultation_status"]
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          assessment?: string | null
          chief_complaint?: string | null
          clinic_id: string
          clinical_notes?: string | null
          completed_at?: string | null
          created_at?: string
          doctor_profile_id: string
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          patient_id: string
          status?: Database["public"]["Enums"]["consultation_status"]
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          assessment?: string | null
          chief_complaint?: string | null
          clinic_id?: string
          clinical_notes?: string | null
          completed_at?: string | null
          created_at?: string
          doctor_profile_id?: string
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          patient_id?: string
          status?: Database["public"]["Enums"]["consultation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultations_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_doctor_profile_id_fkey"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "doctor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_profiles: {
        Row: {
          availability: Json
          bio: string | null
          clinic_id: string
          consultation_fee: number | null
          created_at: string
          department: string | null
          experience_years: number
          id: string
          license_number: string | null
          qualification: string | null
          specialization: string
          status: Database["public"]["Enums"]["doctor_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          availability?: Json
          bio?: string | null
          clinic_id: string
          consultation_fee?: number | null
          created_at?: string
          department?: string | null
          experience_years?: number
          id?: string
          license_number?: string | null
          qualification?: string | null
          specialization: string
          status?: Database["public"]["Enums"]["doctor_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          availability?: Json
          bio?: string | null
          clinic_id?: string
          consultation_fee?: number | null
          created_at?: string
          department?: string | null
          experience_years?: number
          id?: string
          license_number?: string | null
          qualification?: string | null
          specialization?: string
          status?: Database["public"]["Enums"]["doctor_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_profiles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requirements: {
        Row: {
          allowed_mime_types: string[]
          clinic_type: string
          created_at: string
          description: string | null
          doc_key: string
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          max_size_bytes: number
          provisional: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          allowed_mime_types?: string[]
          clinic_type: string
          created_at?: string
          description?: string | null
          doc_key: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          max_size_bytes?: number
          provisional?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allowed_mime_types?: string[]
          clinic_type?: string
          created_at?: string
          description?: string | null
          doc_key?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          max_size_bytes?: number
          provisional?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          appointment_id: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          discount: number
          id: string
          invoice_number: string
          issued_at: string | null
          patient_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          appointment_id?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          invoice_number: string
          issued_at?: string | null
          patient_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          appointment_id?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          invoice_number?: string
          issued_at?: string | null
          patient_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          clinic_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          recipient_user_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          recipient_user_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          recipient_user_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          clinic_id: string
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string | null
          notes: string | null
          patient_number: string
          phone: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          clinic_id: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          patient_number: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          clinic_id?: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          patient_number?: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          clinic_id: string
          created_at: string
          id: string
          invoice_id: string | null
          paid_at: string | null
          patient_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          recorded_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
          transaction_reference: string | null
        }
        Insert: {
          amount: number
          clinic_id: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          patient_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_reference?: string | null
        }
        Update: {
          amount?: number
          clinic_id?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          patient_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          ai_credit_limit: number | null
          ai_credit_type: Database["public"]["Enums"]["ai_credit_type"]
          ai_enabled: boolean
          billing_cycle: string
          clinic_mode: Database["public"]["Enums"]["plan_clinic_mode"]
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          max_clinics: number
          max_doctors: number | null
          max_staff: number | null
          multi_price: number | null
          name: string
          price: number
          razorpay_multi_plan_id: string | null
          razorpay_plan_id: string | null
          requires_payment_mandate: boolean
          trial_duration_days: number | null
          trial_enabled: boolean
          updated_at: string
        }
        Insert: {
          ai_credit_limit?: number | null
          ai_credit_type?: Database["public"]["Enums"]["ai_credit_type"]
          ai_enabled?: boolean
          billing_cycle?: string
          clinic_mode: Database["public"]["Enums"]["plan_clinic_mode"]
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_clinics?: number
          max_doctors?: number | null
          max_staff?: number | null
          multi_price?: number | null
          name: string
          price?: number
          razorpay_multi_plan_id?: string | null
          razorpay_plan_id?: string | null
          requires_payment_mandate?: boolean
          trial_duration_days?: number | null
          trial_enabled?: boolean
          updated_at?: string
        }
        Update: {
          ai_credit_limit?: number | null
          ai_credit_type?: Database["public"]["Enums"]["ai_credit_type"]
          ai_enabled?: boolean
          billing_cycle?: string
          clinic_mode?: Database["public"]["Enums"]["plan_clinic_mode"]
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_clinics?: number
          max_doctors?: number | null
          max_staff?: number | null
          multi_price?: number | null
          name?: string
          price?: number
          razorpay_multi_plan_id?: string | null
          razorpay_plan_id?: string | null
          requires_payment_mandate?: boolean
          trial_duration_days?: number | null
          trial_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          owner_user_id: string
          paid_at: string | null
          payment_method: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subscription_id: string | null
          transaction_reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          owner_user_id: string
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          transaction_reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          owner_user_id?: string
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          transaction_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_payments_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "clinic_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_items: {
        Row: {
          created_at: string
          dosage: string | null
          duration: string | null
          frequency: string | null
          id: string
          instructions: string | null
          medicine_name: string
          prescription_id: string
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medicine_name: string
          prescription_id: string
        }
        Update: {
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medicine_name?: string
          prescription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          clinic_id: string
          consultation_id: string | null
          created_at: string
          doctor_profile_id: string
          id: string
          instructions: string | null
          patient_id: string
          prescription_date: string
          status: Database["public"]["Enums"]["prescription_status"]
          updated_at: string
        }
        Insert: {
          clinic_id: string
          consultation_id?: string | null
          created_at?: string
          doctor_profile_id: string
          id?: string
          instructions?: string | null
          patient_id: string
          prescription_date?: string
          status?: Database["public"]["Enums"]["prescription_status"]
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          consultation_id?: string | null
          created_at?: string
          doctor_profile_id?: string
          id?: string
          instructions?: string | null
          patient_id?: string
          prescription_date?: string
          status?: Database["public"]["Enums"]["prescription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_doctor_profile_id_fkey"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "doctor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          platform_role: Database["public"]["Enums"]["platform_role"]
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          phone?: string | null
          platform_role?: Database["public"]["Enums"]["platform_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          platform_role?: Database["public"]["Enums"]["platform_role"]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      queue_entries: {
        Row: {
          appointment_id: string | null
          called_at: string | null
          checked_in_at: string | null
          clinic_id: string
          completed_at: string | null
          consultation_started_at: string | null
          created_at: string
          doctor_profile_id: string | null
          id: string
          patient_id: string
          queue_date: string
          queue_number: number
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          called_at?: string | null
          checked_in_at?: string | null
          clinic_id: string
          completed_at?: string | null
          consultation_started_at?: string | null
          created_at?: string
          doctor_profile_id?: string | null
          id?: string
          patient_id: string
          queue_date?: string
          queue_number: number
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          called_at?: string | null
          checked_in_at?: string | null
          clinic_id?: string
          completed_at?: string | null
          consultation_started_at?: string | null
          created_at?: string
          doctor_profile_id?: string | null
          id?: string
          patient_id?: string
          queue_date?: string
          queue_number?: number
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_doctor_profile_id_fkey"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "doctor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      razorpay_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
          provider_subscription_id: string | null
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
          provider_subscription_id?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
          provider_subscription_id?: string | null
        }
        Relationships: []
      }
      subscription_clinics: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          subscription_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          subscription_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_clinics_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_clinics_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "clinic_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_events: {
        Row: {
          clinic_id: string | null
          created_at: string
          event_date: string
          event_type: Database["public"]["Enums"]["trial_event_type"]
          id: string
          metadata: Json
          subscription_id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          event_date?: string
          event_type: Database["public"]["Enums"]["trial_event_type"]
          id?: string
          metadata?: Json
          subscription_id: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          event_date?: string
          event_type?: Database["public"]["Enums"]["trial_event_type"]
          id?: string
          metadata?: Json
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "clinic_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_events: {
        Row: {
          actor_user_id: string
          clinic_id: string
          created_at: string
          cycle: number
          event_type: string
          from_status: Database["public"]["Enums"]["verification_status"] | null
          id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          actor_user_id: string
          clinic_id: string
          created_at?: string
          cycle: number
          event_type: string
          from_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          id?: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          actor_user_id?: string
          clinic_id?: string
          created_at?: string
          cycle?: number
          event_type?: string
          from_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "verification_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      vitals: {
        Row: {
          appointment_id: string | null
          blood_pressure_diastolic: number | null
          blood_pressure_systolic: number | null
          clinic_id: string
          consultation_id: string | null
          created_at: string
          heart_rate: number | null
          height: number | null
          id: string
          oxygen_saturation: number | null
          patient_id: string
          recorded_at: string
          recorded_by: string | null
          respiratory_rate: number | null
          temperature: number | null
          weight: number | null
        }
        Insert: {
          appointment_id?: string | null
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          clinic_id: string
          consultation_id?: string | null
          created_at?: string
          heart_rate?: number | null
          height?: number | null
          id?: string
          oxygen_saturation?: number | null
          patient_id: string
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          temperature?: number | null
          weight?: number | null
        }
        Update: {
          appointment_id?: string | null
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          clinic_id?: string
          consultation_id?: string | null
          created_at?: string
          heart_rate?: number | null
          height?: number | null
          id?: string
          oxygen_saturation?: number | null
          patient_id?: string
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          temperature?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vitals_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_mandated_trial: {
        Args: {
          p_clinic: string
          p_plan: string
          p_provider_id: string
          p_scope: string
          p_trial_end: string
          p_user: string
        }
        Returns: string
      }
      cancel_clinic_trial: {
        Args: { p_subscription: string; p_user: string }
        Returns: string
      }
      clinic_is_operational: { Args: { p_clinic: string }; Returns: boolean }
      confirm_trial_mandate: {
        Args: { p_mandate_ref: string; p_provider_id: string }
        Returns: string
      }
      create_first_clinic: {
        Args: {
          p_address?: string
          p_city?: string
          p_clinic_type?: string
          p_display_name: string
          p_email?: string
          p_latitude?: number
          p_longitude?: number
          p_name: string
          p_phone?: string
          p_postal_code?: string
          p_registration_number?: string
          p_representative_name?: string
          p_representative_phone?: string
          p_state?: string
        }
        Returns: string
      }
      register_clinic_document: {
        Args: {
          p_clinic: string
          p_file_name: string
          p_path: string
          p_requirement: string
        }
        Returns: string
      }
      remove_clinic_document: { Args: { p_document: string }; Returns: string }
      review_clinic_document: {
        Args: {
          p_document: string
          p_note: string
          p_status: Database["public"]["Enums"]["document_review_status"]
        }
        Returns: undefined
      }
      review_clinic_verification: {
        Args: {
          p_clinic: string
          p_decision: Database["public"]["Enums"]["verification_status"]
          p_reason: string
        }
        Returns: undefined
      }
      start_clinic_trial: {
        Args: {
          p_clinic: string
          p_plan: string
          p_scope: string
          p_user: string
        }
        Returns: string
      }
      submit_clinic_verification: {
        Args: { p_clinic: string }
        Returns: undefined
      }
    }
    Enums: {
      ai_credit_type: "NONE" | "LIMITED" | "UNLIMITED"
      ai_interaction_status: "REQUESTED" | "COMPLETED" | "FAILED" | "BLOCKED"
      appointment_status:
        | "SCHEDULED"
        | "CONFIRMED"
        | "CHECKED_IN"
        | "IN_QUEUE"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
        | "NO_SHOW"
      appointment_type: "CONSULTATION" | "FOLLOW_UP" | "EMERGENCY" | "OTHER"
      clinic_status: "ACTIVE" | "INACTIVE" | "SUSPENDED"
      consultation_status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
      doctor_status: "ACTIVE" | "INACTIVE" | "ON_LEAVE"
      document_review_status: "PENDING" | "ACCEPTED" | "NEEDS_REPLACEMENT"
      invitation_status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED"
      invoice_status:
        | "DRAFT"
        | "ISSUED"
        | "PARTIALLY_PAID"
        | "PAID"
        | "CANCELLED"
        | "REFUNDED"
      member_role: "OWNER" | "DOCTOR" | "STAFF" | "PATIENT"
      member_status: "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED"
      onboarding_status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"
      payment_method:
        | "CASH"
        | "CARD"
        | "UPI"
        | "BANK_TRANSFER"
        | "ONLINE"
        | "OTHER"
      payment_status:
        | "PENDING"
        | "SUCCESS"
        | "FAILED"
        | "REFUNDED"
        | "CANCELLED"
      plan_clinic_mode: "SINGLE" | "MULTI" | "SINGLE_OR_MULTI"
      platform_role: "PLATFORM_ADMIN" | "USER"
      prescription_status: "ACTIVE" | "COMPLETED" | "CANCELLED"
      queue_status:
        | "WAITING"
        | "CALLED"
        | "IN_CONSULTATION"
        | "COMPLETED"
        | "SKIPPED"
        | "CANCELLED"
      subscription_status:
        | "TRIAL_ACTIVE"
        | "TRIAL_CANCELLED"
        | "TRIAL_EXPIRED"
        | "ACTIVE"
        | "PAST_DUE"
        | "CANCELLED"
        | "EXPIRED"
        | "PENDING_PAYMENT"
      subscription_type: "TRIAL" | "PAID"
      trial_event_type:
        | "TRIAL_STARTED"
        | "MANDATE_CREATED"
        | "TRIAL_EXPIRY_REMINDER_SENT"
        | "TRIAL_CANCELLED"
        | "TRIAL_EXPIRED"
        | "TRIAL_CONVERTED"
        | "PAYMENT_SUCCESS"
        | "PAYMENT_FAILED"
      verification_status:
        | "DRAFT"
        | "PENDING_REVIEW"
        | "CHANGES_REQUESTED"
        | "APPROVED"
        | "REJECTED"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      ai_credit_type: ["NONE", "LIMITED", "UNLIMITED"],
      ai_interaction_status: ["REQUESTED", "COMPLETED", "FAILED", "BLOCKED"],
      appointment_status: [
        "SCHEDULED",
        "CONFIRMED",
        "CHECKED_IN",
        "IN_QUEUE",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "NO_SHOW",
      ],
      appointment_type: ["CONSULTATION", "FOLLOW_UP", "EMERGENCY", "OTHER"],
      clinic_status: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      consultation_status: ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      doctor_status: ["ACTIVE", "INACTIVE", "ON_LEAVE"],
      document_review_status: ["PENDING", "ACCEPTED", "NEEDS_REPLACEMENT"],
      invitation_status: ["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED"],
      invoice_status: [
        "DRAFT",
        "ISSUED",
        "PARTIALLY_PAID",
        "PAID",
        "CANCELLED",
        "REFUNDED",
      ],
      member_role: ["OWNER", "DOCTOR", "STAFF", "PATIENT"],
      member_status: ["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"],
      onboarding_status: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"],
      payment_method: [
        "CASH",
        "CARD",
        "UPI",
        "BANK_TRANSFER",
        "ONLINE",
        "OTHER",
      ],
      payment_status: ["PENDING", "SUCCESS", "FAILED", "REFUNDED", "CANCELLED"],
      plan_clinic_mode: ["SINGLE", "MULTI", "SINGLE_OR_MULTI"],
      platform_role: ["PLATFORM_ADMIN", "USER"],
      prescription_status: ["ACTIVE", "COMPLETED", "CANCELLED"],
      queue_status: [
        "WAITING",
        "CALLED",
        "IN_CONSULTATION",
        "COMPLETED",
        "SKIPPED",
        "CANCELLED",
      ],
      subscription_status: [
        "TRIAL_ACTIVE",
        "TRIAL_CANCELLED",
        "TRIAL_EXPIRED",
        "ACTIVE",
        "PAST_DUE",
        "CANCELLED",
        "EXPIRED",
        "PENDING_PAYMENT",
      ],
      subscription_type: ["TRIAL", "PAID"],
      trial_event_type: [
        "TRIAL_STARTED",
        "MANDATE_CREATED",
        "TRIAL_EXPIRY_REMINDER_SENT",
        "TRIAL_CANCELLED",
        "TRIAL_EXPIRED",
        "TRIAL_CONVERTED",
        "PAYMENT_SUCCESS",
        "PAYMENT_FAILED",
      ],
      verification_status: [
        "DRAFT",
        "PENDING_REVIEW",
        "CHANGES_REQUESTED",
        "APPROVED",
        "REJECTED",
      ],
    },
  },
} as const
