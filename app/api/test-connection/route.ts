import { NextResponse } from 'next/server'
import { checkSupabaseConnection } from '@/lib/supabase'

export async function GET() {
  const result = await checkSupabaseConnection()
  
  return NextResponse.json({
    status: result.connected ? 'connected' : 'disconnected',
    ...result,
    timestamp: new Date().toISOString(),
  })
}

