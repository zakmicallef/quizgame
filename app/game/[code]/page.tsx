"use client";

import { useEffect, useState, useCallback, use } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Player = {
  id: string;
  name: string;
  is_projector: boolean;
  score: number;
  avatar_color: string;
  joined_at: string;
};

type GameSession = {
  id: string;
  code: string;
  status: "waiting" | "playing" | "finished";
  phase: "lobby" | "asking" | "showing_answers" | "quiz";
  current_question_number: number;
  current_question_id: string | null;
};

type Question = {
  id: string;
  game_id: string;
  question_number: number;
  question_text: string;
};

type Answer = {
  id: string;
  answer_text: string;
  player_id: string;
  players: {
    id: string;
    name: string;
    avatar_color: string;
    is_projector: boolean;
  };
};

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [game, setGame] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startingGame, setStartingGame] = useState(false);
  
  // Question states
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [myAnswer, setMyAnswer] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);

  // Fetch players from database
  const fetchPlayers = useCallback(async (gameId: string) => {
    if (!supabase) return [];
    
    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .eq("game_id", gameId)
      .order("joined_at", { ascending: true });
    
    return playersData || [];
  }, []);

  // Fetch questions for this game
  const fetchQuestions = useCallback(async (gameCode: string) => {
    try {
      const res = await fetch(`/api/game/questions?gameCode=${gameCode}`);
      const data = await res.json();
      if (data.questions) {
        setQuestions(data.questions);
        return data.questions;
      }
    } catch (err) {
      console.error("Failed to fetch questions:", err);
    }
    return [];
  }, []);

  // Fetch answers for a question
  const fetchAnswers = useCallback(async (questionId: string) => {
    try {
      const res = await fetch(`/api/game/answer?questionId=${questionId}`);
      const data = await res.json();
      if (data.answers) {
        setAnswers(data.answers);
      }
    } catch (err) {
      console.error("Failed to fetch answers:", err);
    }
  }, []);

  // Generate questions using OpenAI (host only)
  const handleGenerateQuestions = async () => {
    if (!game || !currentPlayer?.is_projector) return;
    
    setGeneratingQuestions(true);
    try {
      const res = await fetch("/api/game/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameCode: game.code,
          playerId: currentPlayer.id,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to generate questions");
        return;
      }

      setQuestions(data.questions);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setGeneratingQuestions(false);
    }
  };

  // Start the game (host only)
  const handleStartGame = async () => {
    if (!game || !currentPlayer?.is_projector) return;
    
    setStartingGame(true);
    try {
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameCode: game.code,
          playerId: currentPlayer.id,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to start game");
        return;
      }

      // Update local game state (realtime will also broadcast this)
      setGame(data.game);
      
      // Generate questions after starting
      await handleGenerateQuestions();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setStartingGame(false);
    }
  };

  // Submit answer (player)
  const handleSubmitAnswer = async () => {
    if (!currentQuestion || !currentPlayer || !myAnswer.trim()) return;
    
    setSubmittingAnswer(true);
    try {
      const res = await fetch("/api/game/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          playerId: currentPlayer.id,
          answer: myAnswer,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to submit answer");
        return;
      }

      setHasSubmitted(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  // Show answers (host only)
  const handleShowAnswers = async () => {
    if (!game || !currentPlayer?.is_projector) return;
    
    try {
      const res = await fetch("/api/game/next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameCode: game.code,
          playerId: currentPlayer.id,
          action: "show_answers",
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to show answers");
        return;
      }

      setGame(data.game);
      
      // Fetch answers for current question
      if (currentQuestion) {
        await fetchAnswers(currentQuestion.id);
      }
    } catch {
      setError("Network error. Try again.");
    }
  };

  // Move to next question (host only)
  const handleNextQuestion = async () => {
    if (!game || !currentPlayer?.is_projector) return;
    
    try {
      const res = await fetch("/api/game/next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameCode: game.code,
          playerId: currentPlayer.id,
          action: "next_question",
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to advance game");
        return;
      }

      setGame(data.game);
      setAnswers([]);
      setMyAnswer("");
      setHasSubmitted(false);
    } catch {
      setError("Network error. Try again.");
    }
  };

  // Update current question when game state changes
  useEffect(() => {
    if (game && questions.length > 0 && game.current_question_number > 0) {
      const q = questions.find(q => q.question_number === game.current_question_number);
      setCurrentQuestion(q || null);
      
      // Check if player already answered this question
      if (q && currentPlayer && !currentPlayer.is_projector) {
        // Reset submission state for new question
        if (currentQuestion?.id !== q.id) {
          setHasSubmitted(false);
          setMyAnswer("");
        }
      }
      
      // If showing answers, fetch them
      if (game.phase === "showing_answers" && q) {
        fetchAnswers(q.id);
      }
    }
  }, [game?.current_question_number, game?.phase, questions, currentPlayer, currentQuestion?.id, fetchAnswers]);

  useEffect(() => {
    const playerId = localStorage.getItem("playerId");

    if (!supabase) {
      setError("Database not configured");
      setLoading(false);
      return;
    }

    if (!playerId) {
      setError("No player ID found. Please join from home page.");
      setLoading(false);
      return;
    }

    let playersChannel: RealtimeChannel | null = null;
    let gameChannel: RealtimeChannel | null = null;
    let answersChannel: RealtimeChannel | null = null;
    let mounted = true;

    async function loadGame() {
      // Fetch game
      const { data: gameData, error: gameError } = await supabase!
        .from("game_sessions")
        .select("*")
        .eq("code", code.toUpperCase())
        .single();

      if (gameError || !gameData) {
        if (mounted) {
          setError("Game not found");
          setLoading(false);
        }
        return;
      }

      if (mounted) setGame(gameData);

      // Fetch all players
      const playersData = await fetchPlayers(gameData.id);
      
      if (mounted) {
        setPlayers(playersData);
        
        // Find current player by ID from localStorage
        const me = playersData.find((p) => p.id === playerId);
        if (me) {
          setCurrentPlayer(me);
        } else {
          setError("You are not in this game. Please join from home page.");
          setLoading(false);
          return;
        }
      }

      // Fetch questions if game has started
      if (gameData.status === "playing") {
        await fetchQuestions(code);
      }

      // Subscribe to player changes for this game
      playersChannel = supabase!
        .channel(`game-players-${gameData.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "players",
            filter: `game_id=eq.${gameData.id}`,
          },
          async (payload) => {
            console.log("Player event:", payload.eventType, payload);
            
            if (payload.eventType === "INSERT") {
              const newPlayer = payload.new as Player;
              setPlayers((prev) => {
                if (prev.some((p) => p.id === newPlayer.id)) return prev;
                return [...prev, newPlayer];
              });
            } else if (payload.eventType === "DELETE") {
              const oldPlayer = payload.old as { id: string };
              setPlayers((prev) => prev.filter((p) => p.id !== oldPlayer.id));
            } else if (payload.eventType === "UPDATE") {
              const updatedPlayer = payload.new as Player;
              setPlayers((prev) =>
                prev.map((p) => (p.id === updatedPlayer.id ? updatedPlayer : p))
              );
            }
          }
        )
        .subscribe((status, err) => {
          console.log("Players subscription:", status, err);
          if (status === "SUBSCRIBED") {
            console.log("✓ Listening for player changes");
          }
        });

      // Subscribe to game session changes (for status updates)
      gameChannel = supabase!
        .channel(`game-session-${gameData.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "game_sessions",
            filter: `id=eq.${gameData.id}`,
          },
          async (payload) => {
            console.log("Game event:", payload.eventType, payload);
            const updatedGame = payload.new as GameSession;
            setGame(updatedGame);
            
            // Fetch questions when game starts
            if (updatedGame.status === "playing" && updatedGame.phase === "asking") {
              await fetchQuestions(code);
            }
            
            // Reset answer state when moving to new question
            if (updatedGame.phase === "asking") {
              setHasSubmitted(false);
              setMyAnswer("");
            }
          }
        )
        .subscribe((status, err) => {
          console.log("Game subscription:", status, err);
          if (status === "SUBSCRIBED") {
            console.log("✓ Listening for game changes");
          }
        });

      // Subscribe to answers for real-time answer count
      answersChannel = supabase!
        .channel(`game-answers-${gameData.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "answers",
          },
          async (payload) => {
            console.log("Answer event:", payload.eventType, payload);
            // Refresh answers if we're on showing_answers phase
            if (game?.phase === "showing_answers" && currentQuestion) {
              await fetchAnswers(currentQuestion.id);
            }
          }
        )
        .subscribe();

      if (mounted) setLoading(false);
    }

    loadGame();

    // Poll for updates as backup (every 3 seconds)
    const pollInterval = setInterval(async () => {
      if (game?.id) {
        const freshPlayers = await fetchPlayers(game.id);
        setPlayers(freshPlayers);
        
        // Also refresh game status
        if (supabase) {
          const { data: freshGame } = await supabase
            .from("game_sessions")
            .select("*")
            .eq("id", game.id)
            .single();
          if (freshGame) setGame(freshGame);
        }
      }
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(pollInterval);
      if (playersChannel) {
        console.log("Cleaning up players channel");
        supabase?.removeChannel(playersChannel);
      }
      if (gameChannel) {
        console.log("Cleaning up game channel");
        supabase?.removeChannel(gameChannel);
      }
      if (answersChannel) {
        console.log("Cleaning up answers channel");
        supabase?.removeChannel(answersChannel);
      }
    };
  }, [code, fetchPlayers, fetchQuestions, game?.id, game?.phase, currentQuestion, fetchAnswers]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-violet-500 rounded-full animate-spin" />
          <span className="text-zinc-400 text-lg">Loading game...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">{error}</p>
          <a href="/" className="text-violet-400 hover:underline">← Back to home</a>
        </div>
      </div>
    );
  }

  // Use database is_projector field to determine view
  const isHost = currentPlayer?.is_projector === true;
  const regularPlayers = players.filter((p) => !p.is_projector);
  const host = players.find((p) => p.is_projector);

  // HOST VIEW (Projector) - Question Phase
  if (isHost && game?.status === "playing" && game?.phase !== "lobby") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden relative">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-fuchsia-500/5 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 min-h-screen flex flex-col p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-black">
                <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                  QUIZ
                </span>
                <span className="text-white/90">CLASH</span>
              </h1>
              <div className="px-4 py-2 bg-zinc-800/60 rounded-full text-zinc-400 text-sm">
                {game?.code}
              </div>
            </div>
            <div className="text-zinc-400">
              Question {game?.current_question_number || 1} of {questions.length || 3}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {generatingQuestions ? (
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-zinc-600 border-t-violet-500 rounded-full animate-spin mx-auto mb-6" />
                <p className="text-2xl text-zinc-300">Generating questions...</p>
                <p className="text-zinc-500 mt-2">Using AI to create fun icebreakers</p>
              </div>
            ) : game?.phase === "asking" ? (
              <>
                {/* Question Display */}
                <div className="w-full max-w-4xl">
                  <div className="text-center mb-12">
                    <p className="text-violet-400 text-lg font-medium mb-4 uppercase tracking-wider">
                      Get to know each other
                    </p>
                    <h2 className="text-5xl font-bold leading-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                      {currentQuestion?.question_text || "Loading question..."}
                    </h2>
                  </div>

                  {/* Player status - who has answered */}
                  <div className="flex justify-center gap-4 mb-12">
                    {regularPlayers.map((player) => (
                      <div
                        key={player.id}
                        className="flex flex-col items-center gap-2"
                      >
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-4 transition-all"
                          style={{
                            backgroundColor: player.avatar_color,
                            borderColor: "rgba(255,255,255,0.1)",
                          }}
                        >
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-zinc-400 text-sm">{player.name}</p>
                      </div>
                    ))}
                  </div>

                  {/* Show Answers Button */}
                  <div className="text-center">
                    <button
                      onClick={handleShowAnswers}
                      className="px-10 py-5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-2xl font-bold text-xl transition-all transform hover:scale-105 shadow-xl shadow-violet-500/20"
                    >
                      Show Answers →
                    </button>
                  </div>
                </div>
              </>
            ) : game?.phase === "showing_answers" ? (
              <>
                {/* Showing Answers */}
                <div className="w-full max-w-5xl">
                  <div className="text-center mb-8">
                    <p className="text-emerald-400 text-lg font-medium mb-2">
                      Everyone answered:
                    </p>
                    <h2 className="text-3xl font-bold text-zinc-300 mb-8">
                      {currentQuestion?.question_text}
                    </h2>
                  </div>

                  {/* Answers Grid */}
                  <div className="grid grid-cols-2 gap-6 mb-12">
                    {answers.filter(a => !a.players?.is_projector).map((answer, idx) => (
                      <div
                        key={answer.id}
                        className="bg-zinc-800/60 backdrop-blur-xl border border-zinc-700 rounded-2xl p-6 transform transition-all"
                        style={{
                          animation: `fadeInUp 0.5s ease-out ${idx * 0.15}s both`,
                        }}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
                            style={{ backgroundColor: answer.players?.avatar_color || "#6366f1" }}
                          >
                            {answer.players?.name?.charAt(0).toUpperCase() || "?"}
                          </div>
                          <div className="flex-1">
                            <p className="text-white font-medium mb-1">
                              {answer.players?.name || "Unknown"}
                            </p>
                            <p className="text-zinc-300 text-lg leading-relaxed">
                              "{answer.answer_text}"
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Next Question Button */}
                  <div className="text-center">
                    <button
                      onClick={handleNextQuestion}
                      className="px-10 py-5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white rounded-2xl font-bold text-xl transition-all transform hover:scale-105 shadow-xl shadow-emerald-500/20"
                    >
                      {(game?.current_question_number || 0) >= (questions.length || 3) 
                        ? "Finish Icebreakers →" 
                        : "Next Question →"}
                    </button>
                  </div>
                </div>
              </>
            ) : game?.phase === "quiz" ? (
              <div className="text-center">
                <div className="text-6xl mb-6">🎉</div>
                <h2 className="text-4xl font-bold text-white mb-4">
                  Icebreakers Complete!
                </h2>
                <p className="text-zinc-400 text-xl">
                  Now you know a bit more about each other!
                </p>
                <p className="text-zinc-500 mt-8">
                  Quiz round coming soon...
                </p>
              </div>
            ) : null}
          </div>

          {/* Host info */}
          {host && (
            <div className="absolute bottom-8 left-8 flex items-center gap-3 text-zinc-500">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ backgroundColor: host.avatar_color }}
              >
                {host.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-white font-medium">{host.name}</p>
                <p className="text-xs uppercase tracking-wider">Host</p>
              </div>
            </div>
          )}
        </div>

        <style jsx>{`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    );
  }

  // HOST VIEW (Projector) - Lobby/Waiting
  if (isHost) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden relative">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-6xl font-black tracking-tight mb-4">
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                QUIZ
              </span>
              <span className="text-white/90">CLASH</span>
            </h1>
            <p className="text-zinc-500 text-lg">
              {regularPlayers.length === 0 
                ? "Waiting for players to join..." 
                : `${regularPlayers.length} player${regularPlayers.length !== 1 ? 's' : ''} joined!`}
            </p>
          </div>

          {/* Game Code Display */}
          <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-700 rounded-3xl p-8 mb-12">
            <p className="text-zinc-400 text-center mb-2 text-sm uppercase tracking-wider">Join Code</p>
            <p className="text-7xl font-black text-center tracking-[0.3em] bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              {game?.code}
            </p>
          </div>

          {/* Players Grid */}
          <div className="w-full max-w-4xl">
            <div className="grid grid-cols-4 gap-6">
              {[0, 1, 2, 3].map((slot) => {
                const player = regularPlayers[slot];
                return (
                  <div
                    key={slot}
                    className={`
                      aspect-square rounded-3xl flex flex-col items-center justify-center
                      transition-all duration-500 ease-out
                      ${player
                        ? "bg-zinc-800/80 border-2 scale-100 opacity-100"
                        : "bg-zinc-900/40 border border-dashed border-zinc-700 scale-95 opacity-60"
                      }
                    `}
                    style={{
                      borderColor: player?.avatar_color || undefined,
                      boxShadow: player ? `0 0 40px ${player.avatar_color}30` : undefined,
                    }}
                  >
                    {player ? (
                      <>
                        {/* Avatar */}
                        <div
                          className="w-20 h-20 rounded-full flex items-center justify-center text-4xl font-bold mb-4"
                          style={{ backgroundColor: player.avatar_color }}
                        >
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        {/* Name */}
                        <p className="text-xl font-bold text-white">{player.name}</p>
                        <p className="text-zinc-500 text-sm">Player {slot + 1}</p>
                      </>
                    ) : (
                      <>
                        <div className="w-20 h-20 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4">
                          <span className="text-4xl text-zinc-600">?</span>
                        </div>
                        <p className="text-zinc-600 text-lg">Waiting...</p>
                        <p className="text-zinc-700 text-sm">Player {slot + 1}</p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Player Count & Start Button */}
          <div className="mt-12 text-center">
            <p className="text-2xl font-bold">
              <span className="text-violet-400">{regularPlayers.length}</span>
              <span className="text-zinc-600"> / 4 players</span>
            </p>
            {regularPlayers.length >= 1 && game?.status === "waiting" && (
              <button 
                onClick={handleStartGame}
                disabled={startingGame || generatingQuestions}
                className="mt-6 px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-xl transition-all transform hover:scale-105"
              >
                {startingGame ? "Starting..." : generatingQuestions ? "Generating Questions..." : "Start Game →"}
              </button>
            )}
            {game?.status === "playing" && (
              <p className="mt-6 text-2xl font-bold text-emerald-400 animate-pulse">
                🎮 Game in progress!
              </p>
            )}
          </div>

          {/* Host info */}
          {host && (
            <div className="absolute bottom-8 left-8 flex items-center gap-3 text-zinc-500">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ backgroundColor: host.avatar_color }}
              >
                {host.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-white font-medium">{host.name}</p>
                <p className="text-xs uppercase tracking-wider">Host</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // PLAYER VIEW - Question Phase
  if (game?.status === "playing" && game?.phase !== "lobby") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: currentPlayer?.avatar_color
              ? `radial-gradient(circle at center, ${currentPlayer.avatar_color}40 0%, transparent 70%)`
              : undefined,
          }}
        />

        <div className="relative z-10 w-full max-w-lg">
          {game?.phase === "asking" ? (
            <>
              {/* Question Card - Prominent Display */}
              <div className="bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 rounded-3xl p-6 mb-6 backdrop-blur-xl">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="text-2xl">💭</span>
                  <p className="text-violet-300 text-sm font-medium uppercase tracking-wider">
                    Question {game?.current_question_number || 1} of {questions.length || 3}
                  </p>
                </div>
                <h2 className="text-2xl font-bold text-white leading-relaxed text-center">
                  {currentQuestion?.question_text || "Loading question..."}
                </h2>
              </div>

              {/* Answer Input */}
              {!hasSubmitted ? (
                <div className="space-y-4">
                  <label className="block text-zinc-400 text-sm font-medium mb-2 text-center">
                    Your answer:
                  </label>
                  <textarea
                    value={myAnswer}
                    onChange={(e) => setMyAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    className="w-full h-32 bg-zinc-900/80 border-2 border-zinc-700 rounded-2xl p-4 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 resize-none text-lg"
                    maxLength={200}
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-sm">
                      {myAnswer.length}/200
                    </span>
                    <button
                      onClick={handleSubmitAnswer}
                      disabled={submittingAnswer || !myAnswer.trim()}
                      className="px-8 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all transform hover:scale-105 shadow-lg shadow-violet-500/20"
                    >
                      {submittingAnswer ? "Sending..." : "Submit →"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 bg-zinc-900/40 rounded-2xl border border-zinc-800">
                  <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-emerald-400 font-bold text-xl mb-2">Answer submitted!</p>
                  <p className="text-zinc-500">Waiting for others...</p>
                </div>
              )}
            </>
          ) : game?.phase === "showing_answers" ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-6">👀</div>
              <h2 className="text-2xl font-bold text-white mb-4">
                Look at the screen!
              </h2>
              <p className="text-zinc-400">
                See what everyone answered
              </p>
            </div>
          ) : game?.phase === "quiz" ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-6">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-4">
                Icebreakers done!
              </h2>
              <p className="text-zinc-400">
                Get ready for the quiz...
              </p>
            </div>
          ) : null}

          {/* Player Avatar */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ backgroundColor: currentPlayer?.avatar_color || "#6366f1" }}
            >
              {currentPlayer?.name.charAt(0).toUpperCase() || "?"}
            </div>
            <span className="text-zinc-400">{currentPlayer?.name}</span>
          </div>
        </div>
      </div>
    );
  }

  // PLAYER VIEW - Waiting/Lobby
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: currentPlayer?.avatar_color
            ? `radial-gradient(circle at center, ${currentPlayer.avatar_color}40 0%, transparent 70%)`
            : undefined,
        }}
      />

      <div className="relative z-10 text-center">
        {/* Player Avatar */}
        <div
          className="w-32 h-32 rounded-full flex items-center justify-center text-6xl font-bold mx-auto mb-6 shadow-2xl"
          style={{
            backgroundColor: currentPlayer?.avatar_color || "#6366f1",
            boxShadow: `0 0 60px ${currentPlayer?.avatar_color || "#6366f1"}50`,
          }}
        >
          {currentPlayer?.name.charAt(0).toUpperCase() || "?"}
        </div>

        {/* Player Name */}
        <h1 className="text-4xl font-black mb-2">{currentPlayer?.name}</h1>
        <p className="text-zinc-500 text-lg mb-12">You're in!</p>

        {/* Game Code */}
        <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-2xl px-8 py-6 mb-8">
          <p className="text-zinc-500 text-sm mb-1">Game Code</p>
          <p className="text-3xl font-black tracking-[0.2em] text-white">{game?.code}</p>
        </div>

        {/* Status */}
        {game?.status === "waiting" && (
          <div className="flex items-center justify-center gap-3 text-zinc-400">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
            <span>Waiting for host to start...</span>
          </div>
        )}
        {game?.status === "playing" && (
          <div className="flex items-center justify-center gap-3 text-emerald-400">
            <div className="w-3 h-3 bg-emerald-400 rounded-full" />
            <span className="font-bold text-lg">🎮 Game started! Get ready!</span>
          </div>
        )}

        {/* Other Players */}
        <div className="mt-12">
          <p className="text-zinc-600 text-sm mb-4">Players joined ({regularPlayers.length})</p>
          <div className="flex justify-center gap-3 flex-wrap">
            {regularPlayers.map((p) => (
              <div
                key={p.id}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all ${
                  p.id === currentPlayer?.id ? "ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0f]" : ""
                }`}
                style={{ backgroundColor: p.avatar_color }}
                title={p.name}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
