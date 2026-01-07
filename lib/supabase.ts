import { createClient } from '@supabase/supabase-js'

// Environment variables - must be prefixed with NEXT_PUBLIC_ for client-side access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.supabase_url || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_API_KEY || process.env.supabase_api_key || ''

export const supabase = createClient(supabaseUrl, supabaseKey)

// Helper to check if Supabase is connected
export async function checkSupabaseConnection(): Promise<{
  connected: boolean
  error?: string
}> {
  try {
    // Simple query to check connection - just checks if we can reach Supabase
    const { error } = await supabase.from('_').select('*').limit(1)
    
    // If we get a "relation does not exist" error, that means we connected successfully
    // but the table doesn't exist (which is fine for a connection test)
    if (error && error.code === '42P01') {
      return { connected: true }
    }
    
    // If no error at all, we're connected
    if (!error) {
      return { connected: true }
    }
    
    // Check if it's an auth/connection error vs just a missing table
    if (error.message.includes('Invalid API key') || error.message.includes('JWT')) {
      return { connected: false, error: error.message }
    }
    
    // Any other error but we reached the server
    return { connected: true }
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

