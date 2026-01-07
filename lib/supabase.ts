import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Environment variables - must be prefixed with NEXT_PUBLIC_ for client-side access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.supabase_url || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_API_KEY || process.env.supabase_api_key || ''

// Only create the client if we have valid configuration
let supabase: SupabaseClient | null = null

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

if (isValidUrl(supabaseUrl) && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey)
}

export { supabase }

// Helper to check if Supabase is connected
export async function checkSupabaseConnection(): Promise<{
  connected: boolean
  error?: string
  configured: boolean
}> {
  // Check if Supabase is configured
  if (!supabase) {
    return {
      connected: false,
      configured: false,
      error: 'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_API_KEY environment variables.',
    }
  }

  try {
    // Simple query to check connection - just checks if we can reach Supabase
    const { error } = await supabase.from('_').select('*').limit(1)
    
    // If we get a "relation does not exist" error, that means we connected successfully
    // but the table doesn't exist (which is fine for a connection test)
    if (error && error.code === '42P01') {
      return { connected: true, configured: true }
    }
    
    // If no error at all, we're connected
    if (!error) {
      return { connected: true, configured: true }
    }
    
    // Check if it's an auth/connection error vs just a missing table
    if (error.message.includes('Invalid API key') || error.message.includes('JWT')) {
      return { connected: false, configured: true, error: error.message }
    }
    
    // Any other error but we reached the server
    return { connected: true, configured: true }
  } catch (err) {
    return {
      connected: false,
      configured: true,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
