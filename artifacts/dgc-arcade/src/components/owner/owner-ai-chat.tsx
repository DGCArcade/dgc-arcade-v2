import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Mic, MicOff, Send, Loader2, Zap, X, ChevronDown, ChevronUp, Trash2, AlertCircle } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface OwnerAiChatProps {
  token: string | null;
}

// Web Speech API type declarations
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function OwnerAiChat({ token }: OwnerAiChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "DGC Owner AI online. I'm connected to your live database and can make real changes. Ask me anything — check balances, fix accounts, view stats, ban users, or just ask questions. You can type or use the mic to talk.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [interimText, setInterimText] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Check voice support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognition);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interimText]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText("");
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        setInput(prev => (prev + " " + finalTranscript).trim());
        setInterimText("");
      } else {
        setInterimText(interimTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "aborted") {
        setError(`Voice error: ${event.error}`);
      }
      stopListening();
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [stopListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const sendMessage = useCallback(async (messageText?: string) => {
    const text = (messageText || input).trim();
    if (!text || isLoading) return;

    // Stop listening when sending
    if (isListening) stopListening();

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setInterimText("");
    setIsLoading(true);
    setError(null);

    try {
      // Build conversation history (last 10 messages for context)
      const history = [...messages.slice(-10), userMessage]
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/admin/owner-ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ messages: history })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply || "Done.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message || "Failed to get response");
      const errorMessage: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `Error: ${err.message || "Something went wrong. Please try again."}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, isListening, messages, token, stopListening]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: "welcome-new",
      role: "assistant",
      content: "Chat cleared. What would you like to do?",
      timestamp: new Date()
    }]);
    setError(null);
  };

  const quickActions = [
    { label: "Show all users", action: "Show me all users with their current balances" },
    { label: "Platform stats", action: "Give me the platform statistics" },
    { label: "Pending deposits", action: "Show me all pending deposits" },
    { label: "Fix all balances", action: "Reconcile all account balances against completed deposits" },
    { label: "Recent transactions", action: "Show me the 10 most recent transactions" },
  ];

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="rounded-xl border border-purple-500/30 bg-gradient-to-b from-purple-950/40 to-black/60 shadow-[0_0_40px_rgba(147,51,234,0.12)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/20 bg-purple-950/30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-[0_0_12px_rgba(147,51,234,0.6)]">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-black animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white tracking-wide">DGC Owner AI</span>
              <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">LIVE</span>
            </div>
            <p className="text-[10px] text-purple-400/70 font-mono">Connected to Neon DB · GPT-5 Mini</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearChat}
            className="p-1.5 rounded text-purple-400/60 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded text-purple-400/60 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Quick Actions */}
          <div className="px-4 pt-3 pb-2 flex flex-wrap gap-1.5">
            {quickActions.map((qa) => (
              <button
                key={qa.label}
                onClick={() => sendMessage(qa.action)}
                disabled={isLoading}
                className="text-[10px] font-mono px-2.5 py-1 rounded-full border border-purple-500/30 text-purple-300/80 hover:text-purple-200 hover:border-purple-400/50 hover:bg-purple-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {qa.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="h-80 overflow-y-auto px-4 py-2 space-y-3 scrollbar-thin scrollbar-thumb-purple-500/20">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-purple-600/80 text-white rounded-tr-sm"
                        : "bg-white/5 text-gray-200 border border-white/10 rounded-tl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[9px] text-gray-600 font-mono px-1">{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            ))}

            {/* Interim voice text */}
            {interimText && (
              <div className="flex gap-2.5 flex-row-reverse">
                <div className="max-w-[80%] items-end flex flex-col gap-1">
                  <div className="rounded-2xl rounded-tr-sm px-3 py-2 text-sm bg-purple-600/40 text-purple-200 border border-purple-500/30 italic">
                    {interimText}
                    <span className="ml-1 inline-block w-1 h-3.5 bg-purple-400 animate-pulse rounded-sm" />
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-2.5">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-purple-400/70 font-mono">Processing...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
            </div>
          )}

          {/* Input area */}
          <div className="px-4 pb-4 pt-2 border-t border-purple-500/20">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? "Listening... speak now" : "Ask me anything or give a command..."}
                  rows={1}
                  className={`w-full resize-none rounded-xl border px-3 py-2.5 text-sm bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-1 transition-all pr-10 ${
                    isListening
                      ? "border-red-500/50 focus:ring-red-500/30 bg-red-950/20"
                      : "border-purple-500/30 focus:ring-purple-500/30"
                  }`}
                  style={{ minHeight: "42px", maxHeight: "120px" }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = Math.min(target.scrollHeight, 120) + "px";
                  }}
                />
                {isListening && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  </div>
                )}
              </div>

              {/* Voice button */}
              {voiceSupported && (
                <button
                  onClick={toggleListening}
                  disabled={isLoading}
                  className={`p-2.5 rounded-xl border transition-all flex-shrink-0 ${
                    isListening
                      ? "bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                      : "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:border-purple-400/50"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={isListening ? "Stop listening" : "Start voice input"}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}

              {/* Send button */}
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || (!input.trim() && !interimText)}
                className="p-2.5 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(147,51,234,0.3)] hover:shadow-[0_0_20px_rgba(147,51,234,0.5)]"
                title="Send message"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between mt-2">
              <p className="text-[10px] text-gray-600 font-mono">
                {isListening ? (
                  <span className="text-red-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                    Listening — speak your command
                  </span>
                ) : (
                  "Enter to send · Shift+Enter for new line · Mic for voice"
                )}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-purple-500/50 font-mono">
                <Zap className="w-2.5 h-2.5" />
                <span>Live DB access</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
