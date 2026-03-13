import { createClient } from '@supabase/supabase-js'

// You will find these keys in your Supabase Project Settings > API
const supabaseUrl = 'https://mtvvkvyslwrdkvqzktxt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10dnZrdnlzbHdyZGt2cXprdHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTA4MzEsImV4cCI6MjA4ODg4NjgzMX0.aojaZCYrEoyKExdJ97oA-pZoTnzlnOSc1k2qv7_0jIs'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)