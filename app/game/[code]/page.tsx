"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
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
  phase: "lobby" | "asking" | "showing_answers" | "quiz" | "quiz_question" | "quiz_results" | "game_over";
  current_question_number: number;
  current_question_id: string | null;
  current_quiz_question_id: string | null;
  current_quiz_question_number: number;
  question_deadline: string | null;
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

type QuizQuestion = {
  id: string;
  game_id: string;
  about_player_id: string;
  question_text: string;
  correct_answer: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  question_order: number;
  players?: {
    id: string;
    name: string;
    avatar_color: string;
  };
};

type QuizAnswer = {
  id: string;
  quiz_question_id: string;
  player_id: string;
  selected_option: string;
  is_correct: boolean;
  players?: {
    id: string;
    name: string;
    avatar_color: string;
    is_projector: boolean;
  };
};

type ScoreChange = {
  playerId: string;
  change: number;
  reason: string;
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
  
  // Quiz states
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuizQuestion, setCurrentQuizQuestion] = useState<QuizQuestion | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasSubmittedQuiz, setHasSubmittedQuiz] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  const [scoreChanges, setScoreChanges] = useState<ScoreChange[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
      
      // Update game state with the returned game (includes current_question_number: 1)
      if (data.game) {
        setGame(data.game);
      }
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
    if (!myAnswer.trim()) return;
    
    if (!currentPlayer) {
      setError("Player not found. Please refresh.");
      return;
    }
    
    if (!currentQuestion) {
      // Try to fetch questions if we don't have the current question
      console.log("No current question, attempting to fetch questions...");
      const fetchedQuestions = await fetchQuestions(code);
      if (fetchedQuestions.length > 0 && game?.current_question_number) {
        const q = fetchedQuestions.find((q: Question) => q.question_number === game.current_question_number);
        if (q) {
          setCurrentQuestion(q);
          // Continue with submission using the fetched question
          await submitAnswerToServer(q.id, currentPlayer.id, myAnswer);
          return;
        }
      }
      setError("Question not loaded. Please wait a moment and try again.");
      return;
    }
    
    await submitAnswerToServer(currentQuestion.id, currentPlayer.id, myAnswer);
  };
  
  // Helper to submit answer to server
  const submitAnswerToServer = async (questionId: string, playerId: string, answer: string) => {
    setSubmittingAnswer(true);
    try {
      const res = await fetch("/api/game/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          playerId,
          answer,
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

  // Fetch quiz questions
  const fetchQuizQuestions = useCallback(async (gameCode: string) => {
    try {
      const res = await fetch(`/api/game/quiz/generate?gameCode=${gameCode}`);
      const data = await res.json();
      if (data.quizQuestions) {
        setQuizQuestions(data.quizQuestions);
        return data.quizQuestions;
      }
    } catch (err) {
      console.error("Failed to fetch quiz questions:", err);
    }
    return [];
  }, []);

  // Fetch quiz answers for current question
  const fetchQuizAnswers = useCallback(async (quizQuestionId: string) => {
    try {
      const res = await fetch(`/api/game/quiz/answer?quizQuestionId=${quizQuestionId}`);
      const data = await res.json();
      if (data.answers) {
        setQuizAnswers(data.answers);
      }
    } catch (err) {
      console.error("Failed to fetch quiz answers:", err);
    }
  }, []);

  // Generate quiz questions (host only)
  const handleStartQuiz = async () => {
    if (!game || !currentPlayer?.is_projector) return;
    
    setGeneratingQuiz(true);
    try {
      const res = await fetch("/api/game/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameCode: game.code,
          playerId: currentPlayer.id,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to generate quiz questions");
        return;
      }

      setQuizQuestions(data.quizQuestions);
      
      // Refresh game state to get new phase
      const { data: freshGame } = await supabase!
        .from("game_sessions")
        .select("*")
        .eq("id", game.id)
        .single();
      if (freshGame) {
        setGame(freshGame);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setGeneratingQuiz(false);
    }
  };

  // Submit quiz answer
  const handleSubmitQuizAnswer = async (option: string) => {
    if (!currentQuizQuestion || !currentPlayer || hasSubmittedQuiz) return;
    
    setSelectedOption(option);
    setHasSubmittedQuiz(true);
    
    try {
      const res = await fetch("/api/game/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizQuestionId: currentQuizQuestion.id,
          playerId: currentPlayer.id,
          selectedOption: option,
        }),
      });

      const data = await res.json();
      
      if (!res.ok && data.error !== "Already answered this question") {
        setError(data.error || "Failed to submit answer");
        return;
      }
    } catch {
      setError("Network error. Try again.");
    }
  };

  // Show quiz results (host only)
  const handleShowQuizResults = async () => {
    if (!game || !currentPlayer?.is_projector) return;
    
    // Clear the timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    try {
      const res = await fetch("/api/game/quiz/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameCode: game.code,
          playerId: currentPlayer.id,
          action: "show_results",
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to show results");
        return;
      }

      setGame(data.game);
      setScoreChanges(data.scoreChanges || []);
      
      // Fetch answers for this question
      if (currentQuizQuestion) {
        await fetchQuizAnswers(currentQuizQuestion.id);
      }
      
      // Refresh players to get updated scores
      if (game?.id) {
        const freshPlayers = await fetchPlayers(game.id);
        setPlayers(freshPlayers);
      }
    } catch {
      setError("Network error. Try again.");
    }
  };

  // Move to next quiz question (host only)
  const handleNextQuizQuestion = async () => {
    if (!game || !currentPlayer?.is_projector) return;
    
    try {
      const res = await fetch("/api/game/quiz/next", {
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
        setError(data.error || "Failed to advance quiz");
        return;
      }

      setGame(data.game);
      setQuizAnswers([]);
      setSelectedOption(null);
      setHasSubmittedQuiz(false);
      setScoreChanges([]);
      setTimeLeft(20);
    } catch {
      setError("Network error. Try again.");
    }
  };

  // Update current question when game state changes
  useEffect(() => {
    async function updateCurrentQuestion() {
      if (!game) return;
      
      // If game is playing (any phase except lobby) but we don't have questions, fetch them
      if (game.status === "playing" && game.phase !== "lobby" && questions.length === 0) {
        console.log("Fetching questions because game is playing but questions are empty");
        await fetchQuestions(code);
        return; // Will re-run when questions are set
      }
      
      if (questions.length > 0 && game.current_question_number > 0) {
        const q = questions.find(q => q.question_number === game.current_question_number);
        console.log("Setting current question:", q?.question_text, "for question number:", game.current_question_number);
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
    }
    
    updateCurrentQuestion();
  }, [game?.current_question_number, game?.phase, game?.status, questions, currentPlayer, currentQuestion?.id, fetchAnswers, code, fetchQuestions]);

  // Update current quiz question when game state changes
  useEffect(() => {
    async function updateCurrentQuizQuestion() {
      if (!game) return;
      
      // If in quiz phase but no quiz questions, fetch them
      if ((game.phase === "quiz_question" || game.phase === "quiz_results") && quizQuestions.length === 0) {
        console.log("Fetching quiz questions");
        await fetchQuizQuestions(code);
        return;
      }
      
      if (quizQuestions.length > 0 && game.current_quiz_question_number > 0) {
        const q = quizQuestions.find(q => q.question_order === game.current_quiz_question_number);
        console.log("Setting current quiz question:", q?.question_text);
        setCurrentQuizQuestion(q || null);
        
        // Reset submission state for new question
        if (q && currentQuizQuestion?.id !== q.id) {
          setHasSubmittedQuiz(false);
          setSelectedOption(null);
          setScoreChanges([]);
        }
        
        // If showing results, fetch quiz answers
        if (game.phase === "quiz_results" && q) {
          fetchQuizAnswers(q.id);
        }
      }
    }
    
    updateCurrentQuizQuestion();
  }, [game?.current_quiz_question_number, game?.phase, quizQuestions, currentQuizQuestion?.id, fetchQuizAnswers, code, fetchQuizQuestions]);

  // Timer effect for quiz questions
  useEffect(() => {
    if (game?.phase !== "quiz_question" || !game?.question_deadline) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const deadline = new Date(game.question_deadline).getTime();
    
    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 100);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [game?.phase, game?.question_deadline]);

  // Auto-show results when timer reaches 0 (host only)
  useEffect(() => {
    if (timeLeft === 0 && game?.phase === "quiz_question" && currentPlayer?.is_projector) {
      handleShowQuizResults();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, game?.phase, currentPlayer?.is_projector]);

  // Keep currentPlayer in sync with players array (for score updates)
  useEffect(() => {
    if (currentPlayer && players.length > 0) {
      const updated = players.find(p => p.id === currentPlayer.id);
      if (updated && updated.score !== currentPlayer.score) {
        setCurrentPlayer(updated);
      }
    }
  }, [players, currentPlayer]);

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

      // Fetch questions if game has started (any phase except lobby means questions exist)
      if (gameData.status === "playing" && gameData.phase !== "lobby") {
        const fetchedQuestions = await fetchQuestions(code);
        // Set current question immediately if we have questions
        if (fetchedQuestions && fetchedQuestions.length > 0 && gameData.current_question_number > 0) {
          const q = fetchedQuestions.find((q: Question) => q.question_number === gameData.current_question_number);
          if (q) {
            setCurrentQuestion(q);
          }
        }
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
            
            // Fetch questions when game is playing (any phase except lobby)
            if (updatedGame.status === "playing" && updatedGame.phase !== "lobby") {
              const fetchedQuestions = await fetchQuestions(code);
              // Set current question immediately
              if (fetchedQuestions && fetchedQuestions.length > 0 && updatedGame.current_question_number > 0) {
                const q = fetchedQuestions.find((q: Question) => q.question_number === updatedGame.current_question_number);
                if (q) {
                  setCurrentQuestion(q);
                }
              }
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
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "quiz_answers",
          },
          async (payload) => {
            console.log("Quiz answer event:", payload.eventType, payload);
            // Refresh quiz answers if we're viewing results
            if (game?.phase === "quiz_results" && game?.current_quiz_question_id) {
              await fetchQuizAnswers(game.current_quiz_question_id);
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
          if (freshGame) {
            setGame(freshGame);
            
            // Fetch questions if game is playing and we don't have them (any phase except lobby)
            if (freshGame.status === "playing" && freshGame.phase !== "lobby" && questions.length === 0) {
              await fetchQuestions(code);
            }
            
            // Fetch quiz questions if in quiz phase and we don't have them
            if ((freshGame.phase === "quiz_question" || freshGame.phase === "quiz_results") && quizQuestions.length === 0) {
              await fetchQuizQuestions(code);
            }
          }
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
  }, [code, fetchPlayers, fetchQuestions, fetchQuizQuestions, fetchQuizAnswers, game?.id, game?.phase, currentQuestion, fetchAnswers, questions.length, quizQuestions.length]);

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
                <p className="text-zinc-400 text-xl mb-8">
                  Now it's time for the quiz round!
                </p>
                <button
                  onClick={handleStartQuiz}
                  disabled={generatingQuiz}
                  className="px-10 py-5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-white rounded-2xl font-bold text-xl transition-all transform hover:scale-105 shadow-xl shadow-amber-500/20"
                >
                  {generatingQuiz ? (
                    <span className="flex items-center gap-3">
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating Quiz...
                    </span>
                  ) : (
                    "🎯 Start Quiz Round →"
                  )}
                </button>
              </div>
            ) : game?.phase === "quiz_question" ? (
              /* Quiz Question View - Host */
              <div className="w-full max-w-5xl">
                {/* Timer */}
                <div className="flex justify-center mb-8">
                  <div className={`
                    relative w-32 h-32 rounded-full flex items-center justify-center
                    ${timeLeft <= 5 ? "bg-red-500/20" : "bg-violet-500/20"}
                  `}>
                    <div className={`
                      absolute inset-2 rounded-full border-4
                      ${timeLeft <= 5 ? "border-red-500" : "border-violet-500"}
                    `} style={{
                      background: `conic-gradient(${timeLeft <= 5 ? "#ef4444" : "#8b5cf6"} ${(timeLeft / 20) * 360}deg, transparent 0deg)`
                    }} />
                    <span className={`text-5xl font-black ${timeLeft <= 5 ? "text-red-400 animate-pulse" : "text-white"}`}>
                      {timeLeft}
                    </span>
                  </div>
                </div>

                {/* About Player Badge */}
                {currentQuizQuestion?.players && (
                  <div className="flex justify-center mb-6">
                    <div className="px-6 py-3 bg-zinc-800/60 rounded-full flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                        style={{ backgroundColor: currentQuizQuestion.players.avatar_color }}
                      >
                        {currentQuizQuestion.players.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-zinc-300">
                        About <span className="text-white font-bold">{currentQuizQuestion.players.name}</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Question */}
                <div className="text-center mb-10">
                  <p className="text-amber-400 text-lg font-medium mb-4 uppercase tracking-wider">
                    Question {game?.current_quiz_question_number} of {quizQuestions.length}
                  </p>
                  <h2 className="text-4xl font-bold leading-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                    {currentQuizQuestion?.question_text || "Loading question..."}
                  </h2>
                </div>

                {/* Options Grid */}
                <div className="grid grid-cols-2 gap-4 mb-10">
                  {[
                    { key: "A", value: currentQuizQuestion?.option_a },
                    { key: "B", value: currentQuizQuestion?.option_b },
                    { key: "C", value: currentQuizQuestion?.option_c },
                    { key: "D", value: currentQuizQuestion?.option_d },
                  ].map((option) => (
                    <div
                      key={option.key}
                      className="bg-zinc-800/60 backdrop-blur-xl border border-zinc-700 rounded-2xl p-6 flex items-start gap-4"
                    >
                      <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-2xl font-black flex-shrink-0">
                        {option.key}
                      </span>
                      <p className="text-xl text-white pt-2">{option.value}</p>
                    </div>
                  ))}
                </div>

                {/* Show Results Button */}
                <div className="text-center">
                  <button
                    onClick={handleShowQuizResults}
                    className="px-10 py-5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-2xl font-bold text-xl transition-all transform hover:scale-105 shadow-xl shadow-violet-500/20"
                  >
                    Show Results →
                  </button>
                </div>

                {/* Player Answer Status */}
                <div className="flex justify-center gap-4 mt-8">
                  {regularPlayers.map((player) => {
                    const hasAnswered = quizAnswers.some(a => a.player_id === player.id);
                    return (
                      <div key={player.id} className="flex flex-col items-center gap-2">
                        <div
                          className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold border-4 transition-all ${
                            hasAnswered ? "border-emerald-500 scale-110" : "border-zinc-600"
                          }`}
                          style={{ backgroundColor: player.avatar_color }}
                        >
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-zinc-400 text-xs">{player.name}</p>
                        {hasAnswered && <span className="text-emerald-400 text-xs">✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : game?.phase === "quiz_results" ? (
              /* Quiz Results View - Host */
              <div className="w-full max-w-5xl">
                {/* About Player Badge */}
                {currentQuizQuestion?.players && (
                  <div className="flex justify-center mb-6">
                    <div className="px-6 py-3 bg-zinc-800/60 rounded-full flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                        style={{ backgroundColor: currentQuizQuestion.players.avatar_color }}
                      >
                        {currentQuizQuestion.players.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-zinc-300">
                        About <span className="text-white font-bold">{currentQuizQuestion.players.name}</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Question */}
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-zinc-300">
                    {currentQuizQuestion?.question_text}
                  </h2>
                </div>

                {/* Options with Results */}
                <div className="grid grid-cols-2 gap-4 mb-10">
                  {[
                    { key: "A", value: currentQuizQuestion?.option_a },
                    { key: "B", value: currentQuizQuestion?.option_b },
                    { key: "C", value: currentQuizQuestion?.option_c },
                    { key: "D", value: currentQuizQuestion?.option_d },
                  ].map((option) => {
                    const isCorrect = currentQuizQuestion?.correct_answer === option.key;
                    const playersWhoChoseThis = quizAnswers.filter(a => a.selected_option === option.key);
                    
                    return (
                      <div
                        key={option.key}
                        className={`
                          backdrop-blur-xl border rounded-2xl p-6 transition-all
                          ${isCorrect 
                            ? "bg-emerald-500/20 border-emerald-500" 
                            : playersWhoChoseThis.length > 0 
                              ? "bg-red-500/10 border-red-500/50" 
                              : "bg-zinc-800/60 border-zinc-700"
                          }
                        `}
                      >
                        <div className="flex items-start gap-4">
                          <span className={`
                            w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black flex-shrink-0
                            ${isCorrect 
                              ? "bg-emerald-500" 
                              : "bg-gradient-to-br from-violet-500 to-fuchsia-500"
                            }
                          `}>
                            {isCorrect ? "✓" : option.key}
                          </span>
                          <div className="flex-1">
                            <p className="text-xl text-white">{option.value}</p>
                            {/* Players who chose this */}
                            {playersWhoChoseThis.length > 0 && (
                              <div className="flex gap-2 mt-3">
                                {playersWhoChoseThis.map(answer => (
                                  <div
                                    key={answer.id}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                                    style={{ backgroundColor: answer.players?.avatar_color || "#6366f1" }}
                                    title={answer.players?.name}
                                  >
                                    {answer.players?.name?.charAt(0).toUpperCase() || "?"}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Score Changes */}
                {scoreChanges.length > 0 && (
                  <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-700 rounded-2xl p-6 mb-8">
                    <h3 className="text-lg font-bold text-zinc-300 mb-4 text-center">Score Changes</h3>
                    <div className="flex flex-wrap justify-center gap-4">
                      {scoreChanges.map((change, idx) => {
                        const player = players.find(p => p.id === change.playerId);
                        if (!player) return null;
                        return (
                          <div key={idx} className="flex items-center gap-3 bg-zinc-800/60 px-4 py-2 rounded-xl">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
                              style={{ backgroundColor: player.avatar_color }}
                            >
                              {player.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-white font-medium">{player.name}</p>
                              <p className={`text-sm ${change.change > 0 ? "text-emerald-400" : change.change < 0 ? "text-red-400" : "text-zinc-400"}`}>
                                {change.change > 0 ? `+${change.change}` : change.change} {change.reason}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Next Question Button */}
                <div className="text-center">
                  <button
                    onClick={handleNextQuizQuestion}
                    className="px-10 py-5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white rounded-2xl font-bold text-xl transition-all transform hover:scale-105 shadow-xl shadow-emerald-500/20"
                  >
                    {(game?.current_quiz_question_number || 0) >= quizQuestions.length
                      ? "🏆 See Final Results →"
                      : "Next Question →"}
                  </button>
                </div>

                {/* Current Scores */}
                <div className="mt-8 flex justify-center gap-6">
                  {regularPlayers
                    .sort((a, b) => b.score - a.score)
                    .map((player, idx) => (
                      <div key={player.id} className="flex flex-col items-center gap-2">
                        <div
                          className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-4 ${
                            idx === 0 ? "border-amber-400" : "border-zinc-600"
                          }`}
                          style={{ backgroundColor: player.avatar_color }}
                        >
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-white font-medium">{player.name}</p>
                        <p className="text-2xl font-black text-amber-400">{player.score}</p>
                      </div>
                    ))}
                </div>
              </div>
            ) : game?.phase === "game_over" ? (
              /* Game Over View - Host */
              <div className="w-full max-w-4xl text-center">
                <div className="text-8xl mb-8">🏆</div>
                <h2 className="text-5xl font-black text-white mb-4">Game Over!</h2>
                <p className="text-xl text-zinc-400 mb-12">Final Scores</p>

                {/* Winner & Standings */}
                <div className="flex justify-center items-end gap-4 mb-12">
                  {regularPlayers
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)
                    .map((player, idx) => {
                      const heights = ["h-40", "h-32", "h-24"];
                      const colors = ["from-amber-400 to-yellow-500", "from-zinc-300 to-zinc-400", "from-amber-600 to-amber-700"];
                      const positions = [1, 0, 2];
                      const actualIdx = positions[idx];
                      
                      return (
                        <div key={player.id} className="flex flex-col items-center" style={{ order: actualIdx }}>
                          <div
                            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold mb-4 border-4 border-white/20"
                            style={{ backgroundColor: player.avatar_color }}
                          >
                            {player.name.charAt(0).toUpperCase()}
                          </div>
                          <p className="text-white font-bold text-lg mb-2">{player.name}</p>
                          <div className={`${heights[idx]} w-28 bg-gradient-to-t ${colors[idx]} rounded-t-xl flex items-start justify-center pt-4`}>
                            <span className="text-3xl font-black text-white">{player.score}</span>
                          </div>
                          <div className="bg-zinc-800 w-28 py-2 text-center">
                            <span className="text-2xl font-bold">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* All Players Scores */}
                {regularPlayers.length > 3 && (
                  <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-700 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-zinc-300 mb-4">All Players</h3>
                    <div className="space-y-2">
                      {regularPlayers
                        .sort((a, b) => b.score - a.score)
                        .map((player, idx) => (
                          <div key={player.id} className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 rounded-xl">
                            <div className="flex items-center gap-3">
                              <span className="text-zinc-500 w-6">{idx + 1}.</span>
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                                style={{ backgroundColor: player.avatar_color }}
                              >
                                {player.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-white">{player.name}</span>
                            </div>
                            <span className="text-amber-400 font-bold">{player.score} pts</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Play Again */}
                <div className="mt-12">
                  <a
                    href="/"
                    className="px-8 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-2xl font-bold text-lg transition-all inline-block"
                  >
                    Play Again →
                  </a>
                </div>
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
          {/* Debug: show current phase + refresh button */}
          <div className="absolute top-2 right-2 flex items-center gap-2">
            <span className="text-xs text-zinc-600 bg-zinc-900/50 px-2 py-1 rounded">
              {game?.phase} | Q{game?.current_question_number}
            </span>
            <button
              onClick={async () => {
                if (!supabase || !game?.id) return;
                const { data: freshGame } = await supabase
                  .from("game_sessions")
                  .select("*")
                  .eq("id", game.id)
                  .single();
                if (freshGame) {
                  setGame(freshGame);
                  setHasSubmitted(false);
                  setMyAnswer("");
                }
              }}
              className="text-xs text-zinc-500 hover:text-white bg-zinc-800 px-2 py-1 rounded"
            >
              ↻
            </button>
          </div>
          
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
            <div className="text-center py-8">
              {/* Show the question that was asked */}
              {currentQuestion && (
                <div className="bg-zinc-800/60 rounded-2xl px-5 py-4 mb-6">
                  <p className="text-violet-400 text-xs font-medium mb-2 uppercase tracking-wider">
                    Question {game?.current_question_number || 1}
                  </p>
                  <p className="text-white text-lg font-medium">
                    {currentQuestion.question_text}
                  </p>
                </div>
              )}
              <div className="text-5xl mb-4">👀</div>
              <h2 className="text-xl font-bold text-white mb-2">
                Look at the screen!
              </h2>
              <p className="text-zinc-400 text-sm">
                See what everyone answered
              </p>
            </div>
          ) : game?.phase === "quiz" ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-6">🎯</div>
              <h2 className="text-2xl font-bold text-white mb-4">
                Get Ready!
              </h2>
              <p className="text-zinc-400">
                The quiz round is about to begin...
              </p>
            </div>
          ) : game?.phase === "quiz_question" ? (
            /* Quiz Question View - Player */
            <>
              {/* Timer */}
              <div className="flex justify-center mb-6">
                <div className={`
                  relative w-24 h-24 rounded-full flex items-center justify-center
                  ${timeLeft <= 5 ? "bg-red-500/20" : "bg-violet-500/20"}
                `}>
                  <span className={`text-4xl font-black ${timeLeft <= 5 ? "text-red-400 animate-pulse" : "text-white"}`}>
                    {timeLeft}
                  </span>
                </div>
              </div>

              {/* About Player Badge */}
              {currentQuizQuestion?.players && (
                <div className="flex justify-center mb-4">
                  <div className="px-4 py-2 bg-zinc-800/60 rounded-full flex items-center gap-2 text-sm">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: currentQuizQuestion.players.avatar_color }}
                    >
                      {currentQuizQuestion.players.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-zinc-300">
                      About <span className="text-white font-bold">{currentQuizQuestion.players.name}</span>
                    </span>
                    {currentQuizQuestion.about_player_id === currentPlayer?.id && (
                      <span className="text-amber-400 text-xs">(You!)</span>
                    )}
                  </div>
                </div>
              )}

              {/* Question */}
              <div className="bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 rounded-2xl p-5 mb-6 backdrop-blur-xl">
                <p className="text-amber-400 text-xs font-medium mb-2 uppercase tracking-wider text-center">
                  Question {game?.current_quiz_question_number} of {quizQuestions.length}
                </p>
                <h2 className="text-lg font-bold text-white leading-relaxed text-center">
                  {currentQuizQuestion?.question_text || "Loading..."}
                </h2>
              </div>

              {/* Options */}
              {!hasSubmittedQuiz ? (
                <div className="space-y-3">
                  {[
                    { key: "A", value: currentQuizQuestion?.option_a },
                    { key: "B", value: currentQuizQuestion?.option_b },
                    { key: "C", value: currentQuizQuestion?.option_c },
                    { key: "D", value: currentQuizQuestion?.option_d },
                  ].map((option) => (
                    <button
                      key={option.key}
                      onClick={() => handleSubmitQuizAnswer(option.key)}
                      disabled={hasSubmittedQuiz}
                      className="w-full p-4 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 hover:border-violet-500 rounded-xl text-left transition-all flex items-center gap-3 active:scale-[0.98]"
                    >
                      <span className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-lg font-black flex-shrink-0">
                        {option.key}
                      </span>
                      <span className="text-white">{option.value}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-zinc-900/40 rounded-2xl border border-zinc-800">
                  <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl font-black text-violet-400">{selectedOption}</span>
                  </div>
                  <p className="text-violet-400 font-bold text-lg mb-2">Answer locked in!</p>
                  <p className="text-zinc-500">Waiting for results...</p>
                </div>
              )}
            </>
          ) : game?.phase === "quiz_results" ? (
            /* Quiz Results View - Player */
            <div className="text-center">
              {/* Show what happened */}
              {currentQuizQuestion && (
                <div className="mb-6">
                  <p className="text-zinc-400 text-sm mb-2">The correct answer was:</p>
                  <div className="bg-emerald-500/20 border border-emerald-500 rounded-xl px-6 py-4 inline-block">
                    <span className="text-emerald-400 font-bold text-xl">
                      {currentQuizQuestion.correct_answer}: {
                        currentQuizQuestion.correct_answer === "A" ? currentQuizQuestion.option_a :
                        currentQuizQuestion.correct_answer === "B" ? currentQuizQuestion.option_b :
                        currentQuizQuestion.correct_answer === "C" ? currentQuizQuestion.option_c :
                        currentQuizQuestion.option_d
                      }
                    </span>
                  </div>
                </div>
              )}

              {/* Player's result */}
              {selectedOption && (
                <div className={`mb-6 p-4 rounded-xl ${
                  selectedOption === currentQuizQuestion?.correct_answer
                    ? "bg-emerald-500/20 border border-emerald-500"
                    : "bg-red-500/20 border border-red-500"
                }`}>
                  {selectedOption === currentQuizQuestion?.correct_answer ? (
                    <>
                      <div className="text-4xl mb-2">🎉</div>
                      <p className="text-emerald-400 font-bold text-lg">Correct!</p>
                      {currentQuizQuestion?.about_player_id === currentPlayer?.id ? (
                        <p className="text-emerald-300 text-sm">+2 points for knowing yourself!</p>
                      ) : (
                        <p className="text-emerald-300 text-sm">+1 point</p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-4xl mb-2">😅</div>
                      <p className="text-red-400 font-bold text-lg">Wrong!</p>
                      {currentQuizQuestion?.about_player_id === currentPlayer?.id && (
                        <p className="text-red-300 text-sm">-1 point for not knowing yourself!</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {!selectedOption && (
                <div className="mb-6 p-4 rounded-xl bg-zinc-800/60 border border-zinc-700">
                  <div className="text-4xl mb-2">⏰</div>
                  <p className="text-zinc-400 font-bold text-lg">Time's up!</p>
                  {currentQuizQuestion?.about_player_id === currentPlayer?.id && (
                    <p className="text-red-300 text-sm">-1 point for not answering your own question!</p>
                  )}
                </div>
              )}

              {/* Current Score */}
              <div className="bg-zinc-900/60 rounded-xl px-6 py-4 inline-block">
                <p className="text-zinc-400 text-sm">Your Score</p>
                <p className="text-4xl font-black text-amber-400">{currentPlayer?.score || 0}</p>
              </div>

              <p className="text-zinc-500 text-sm mt-6">Watch the screen for next question...</p>
            </div>
          ) : game?.phase === "game_over" ? (
            /* Game Over View - Player */
            <div className="text-center">
              <div className="text-6xl mb-6">🏆</div>
              <h2 className="text-3xl font-black text-white mb-4">Game Over!</h2>
              
              {/* Player's final position */}
              {(() => {
                const sortedPlayers = [...regularPlayers].sort((a, b) => b.score - a.score);
                const position = sortedPlayers.findIndex(p => p.id === currentPlayer?.id) + 1;
                const isWinner = position === 1;
                
                return (
                  <div className={`mb-8 p-6 rounded-2xl ${isWinner ? "bg-amber-500/20 border-2 border-amber-400" : "bg-zinc-800/60"}`}>
                    {isWinner ? (
                      <>
                        <div className="text-5xl mb-2">🥇</div>
                        <p className="text-amber-400 font-bold text-2xl">You Won!</p>
                      </>
                    ) : (
                      <>
                        <p className="text-zinc-400 mb-2">You placed</p>
                        <p className="text-4xl font-black text-white">#{position}</p>
                      </>
                    )}
                    <p className="text-3xl font-black text-amber-400 mt-4">{currentPlayer?.score} points</p>
                  </div>
                );
              })()}

              {/* All scores */}
              <div className="space-y-2">
                {regularPlayers
                  .sort((a, b) => b.score - a.score)
                  .map((player, idx) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl ${
                        player.id === currentPlayer?.id ? "bg-violet-500/20 border border-violet-500" : "bg-zinc-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500 w-6">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`}</span>
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                          style={{ backgroundColor: player.avatar_color }}
                        >
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-white">{player.name}</span>
                      </div>
                      <span className="text-amber-400 font-bold">{player.score}</span>
                    </div>
                  ))}
              </div>

              {/* Play Again */}
              <a
                href="/"
                className="mt-8 px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl font-bold inline-block"
              >
                Play Again
              </a>
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
