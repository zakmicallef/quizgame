"use client";

import { useEffect, useState } from "react";

type ConnectionStatus = {
  status: "connected" | "disconnected";
  connected: boolean;
  configured: boolean;
  error?: string;
  timestamp: string;
};

export default function Home() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkConnection = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/test-connection");
      const data = await res.json();
      setConnection(data);
    } catch (err) {
      setConnection({
        status: "disconnected",
        connected: false,
        configured: false,
        error: err instanceof Error ? err.message : "Failed to check connection",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white font-sans flex items-center justify-center p-8">
      <main className="w-full max-w-lg">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Quiz Game
          </h1>
          <p className="text-zinc-500 text-sm">Database Status</p>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 backdrop-blur-sm">
          {loading ? (
            <div className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-zinc-600 border-t-emerald-400 rounded-full animate-spin" />
              <span className="text-zinc-400">Checking connection...</span>
            </div>
          ) : connection?.connected ? (
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-3">
                <div className="relative">
                  <div className="w-4 h-4 bg-emerald-500 rounded-full" />
                  <div className="absolute inset-0 w-4 h-4 bg-emerald-500 rounded-full animate-ping opacity-50" />
                </div>
                <span className="text-xl font-semibold text-emerald-400">Connected</span>
              </div>
              <div className="text-center">
                <p className="text-zinc-400 text-sm">
                  Supabase database is online and responding
                </p>
              </div>
              <div className="pt-4 border-t border-zinc-800">
                <p className="text-zinc-600 text-xs text-center font-mono">
                  Last checked: {new Date(connection.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ) : connection?.configured === false ? (
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-3">
                <div className="w-4 h-4 bg-amber-500 rounded-full" />
                <span className="text-xl font-semibold text-amber-400">Not Configured</span>
              </div>
              <div className="text-center">
                <p className="text-zinc-400 text-sm">
                  Supabase environment variables are missing
                </p>
                <div className="text-amber-400/70 text-xs font-mono bg-amber-950/30 rounded-lg p-3 mt-4 text-left">
                  <p className="mb-1">Required env variables:</p>
                  <p className="text-amber-300">NEXT_PUBLIC_SUPABASE_URL</p>
                  <p className="text-amber-300">NEXT_PUBLIC_SUPABASE_API_KEY</p>
                </div>
              </div>
              <div className="pt-4 border-t border-zinc-800">
                <p className="text-zinc-600 text-xs text-center font-mono">
                  Last checked: {connection?.timestamp ? new Date(connection.timestamp).toLocaleTimeString() : "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-3">
                <div className="w-4 h-4 bg-red-500 rounded-full" />
                <span className="text-xl font-semibold text-red-400">Disconnected</span>
              </div>
              <div className="text-center">
                <p className="text-zinc-400 text-sm">
                  Unable to connect to database
                </p>
                {connection?.error && (
                  <p className="text-red-400/70 text-xs font-mono bg-red-950/30 rounded-lg p-3 mt-4">
                    {connection.error}
                  </p>
                )}
              </div>
              <div className="pt-4 border-t border-zinc-800">
                <p className="text-zinc-600 text-xs text-center font-mono">
                  Last checked: {connection?.timestamp ? new Date(connection.timestamp).toLocaleTimeString() : "—"}
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={checkConnection}
          disabled={loading}
          className="mt-6 w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-xl transition-colors text-sm font-medium"
        >
          {loading ? "Checking..." : "Refresh Status"}
        </button>
      </main>
    </div>
  );
}
