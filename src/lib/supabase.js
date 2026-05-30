import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ribdorraxxhfbfkjhpie.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpYmRvcnJheHhoZmJma2pocGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3OTkzNDUsImV4cCI6MjA5NTM3NTM0NX0.w5EMvd47CtWTc-8NgTlsM44EYmbGSQHc79wgjXTQlHE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'trustdubai-auth',
  }
})
