import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ribdorraxxhfbfkjhpie.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LvszMk_GssDM_x64UNuoMg_WR2oy7ve'

export const supabase = createClient(supabaseUrl, supabaseKey)
