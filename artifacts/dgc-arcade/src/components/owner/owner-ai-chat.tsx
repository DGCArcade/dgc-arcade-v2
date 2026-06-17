/**
 * DG AI Chat — Owner-Exclusive Platform Intelligence Interface
 *
 * Features:
 * - Real-time streaming SSE responses (token-by-token like ChatGPT)
 * - Markdown rendering with tables, code blocks, bold text
 * - Tool execution cards showing exactly what the AI did
 * - Voice input via Web Speech API
 * - Quick action buttons for common tasks
 * - Persistent conversation history
 * - Full-screen expandable mode
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Mic,
  MicOff,
  Send,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  AlertCircle,
  Maximize2,
  Minimize2,
  Database,
  GitBranch,
  Rocket,
  BarChart3,
  Users,
  DollarSign,
  Settings,
  Shield,
  CheckCircle2,
  XCircle,
  Zap,
  Code2,
  RefreshCw,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  toolsExecuted?: ToolExecution[];
  isStreaming?: boolean;
}

interface ToolExecution {
  toolName: string;
  result: any;
  success: boolean;
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

// ── Tool icon mapping ─────────────────────────────────────────────────────────

function getToolIcon(toolName: string) {
  if (toolName.startsWith("github_")) return <GitBranch className="w-3 h-3" />;
  if (toolName === "trigger_deploy") return <Rocket className="w-3 h-3" />;
  if (toolName.includes("stat") || toolName.includes("analytic") || toolName.includes("revenue")) return <BarChart3 className="w-3 h-3" />;
  if (toolName.includes("user") || toolName.includes("ban")) return <Users className="w-3 h-3" />;
  if (toolName.includes("balance") || toolName.includes("transaction") || toolName.includes("withdrawal")) return <DollarSign className="w-3 h-3" />;
  if (toolName.includes("game")) return <Zap className="w-3 h-3" />;
  if (toolName.includes("setting")) return <Settings className="w-3 h-3" />;
  if (toolName.includes("fraud")) return <Shield className="w-3 h-3" />;
  return <Database className="w-3 h-3" />;
}

function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    run_db_query: "SQL Query",
    get_platform_stats: "Platform Stats",
    get_all_users: "User List",
    get_user_detail: "User Detail",
    set_user_balance: "Set Balance",
    adjust_user_balance: "Adjust Balance",
    ban_user: "Ban/Unban User",
    set_user_role: "Set Role",
    get_transactions: "Transactions",
    approve_withdrawal: "Approve Withdrawal",
    reject_withdrawal: "Reject Withdrawal",
    reconcile_all_balances: "Reconcile Balances",
    get_games: "Game List",
    update_game: "Update Game",
    get_platform_setting: "Get Setting",
    set_platform_setting: "Set Setting",
    github_status: "Git Status",
    github_read_file: "Read File",
    github_write_and_commit: "Write & Commit",
    github_commit_push: "Commit & Push",
    trigger_deploy: "Trigger Deploy",
    get_revenue_analytics: "Revenue Analytics",
    get_fraud_alerts: "Fraud Alerts",
    get_bet_history: "Bet History",
  };
  return labels[toolName] || toolName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Simple markdown renderer ──────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  const nextKey = () => `md-${keyCounter++}`;

  while (i < lines.length) {
    const line = lines[i];

    // Table detection
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1]?.match(/^\|[\s\-|]+\|$/)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const headers = tableLines[0].split("|").filter(c => c.trim()).map(c => c.trim());
      const rows = tableLines.slice(2).map(row => row.split("|").filter(c => c.trim()).map(c => c.trim()));
      elements.push(
        <div key={nextKey()} className="overflow-x-auto my-2 rounded-lg border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-purple-950/50 border-b border-white/10">
                {headers.map((h, hi) => (
                  <th key={hi} className="px-3 py-2 text-left text-purple-300 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-white/2" : "bg-white/5"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-gray-300 border-b border-white/5">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      const lang = line.slice(3).trim();
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <div key={nextKey()} className="my-2 rounded-lg bg-black/50 border border-white/10 overflow-hidden">
          {lang && <div className="px-3 py-1 text-[10px] font-mono text-purple-400/70 border-b border-white/10 bg-purple-950/30">{lang}</div>}
          <pre className="px-3 py-2 text-xs text-green-300 font-mono overflow-x-auto whitespace-pre-wrap">
            {codeLines.join("\n")}
          </pre>
        </div>
      );
      continue;
    }

    // Heading
    if (line.startsWith("### ")) {
      elements.push(<h3 key={nextKey()} className="text-sm font-bold text-purple-300 mt-3 mb-1">{line.slice(4)}</h3>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h2 key={nextKey()} className="text-base font-bold text-purple-200 mt-3 mb-1">{line.slice(3)}</h2>);
      i++; continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h1 key={nextKey()} className="text-lg font-bold text-white mt-3 mb-1">{line.slice(2)}</h1>);
      i++; continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      elements.push(<hr key={nextKey()} className="border-white/10 my-2" />);
      i++; continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={nextKey()} className="h-1" />);
      i++; continue;
    }

    // Regular paragraph with inline formatting
    const formatted = formatInline(line, nextKey);
    elements.push(<p key={nextKey()} className="text-sm text-gray-200 leading-relaxed">{formatted}</p>);
    i++;
  }

  return <>{elements}</>;
}

function formatInline(text: string, nextKey: () => string): React.ReactNode {
  // Split on bold (**text**), inline code (`code`), and keep the rest
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);
    const dollarMatch = remaining.match(/(\$[\d,]+\.?\d*)/);

    let firstMatch: { index: number; match: RegExpMatchArray; type: string } | null = null;

    if (boldMatch && boldMatch.index !== undefined) {
      firstMatch = { index: boldMatch.index, match: boldMatch, type: "bold" };
    }
    if (codeMatch && codeMatch.index !== undefined && (firstMatch === null || codeMatch.index < firstMatch.index)) {
      firstMatch = { index: codeMatch.index, match: codeMatch, type: "code" };
    }
    if (dollarMatch && dollarMatch.index !== undefined && (firstMatch === null || dollarMatch.index < firstMatch.index)) {
      firstMatch = { index: dollarMatch.index, match: dollarMatch, type: "dollar" };
    }

    if (!firstMatch) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    if (firstMatch.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, firstMatch.index)}</span>);
    }

    if (firstMatch.type === "bold") {
      parts.push(<strong key={key++} className="text-white font-semibold">{firstMatch.match[1]}</strong>);
    } else if (firstMatch.type === "code") {
      parts.push(<code key={key++} className="bg-black/40 text-green-300 px-1 py-0.5 rounded text-xs font-mono">{firstMatch.match[1]}</code>);
    } else if (firstMatch.type === "dollar") {
      parts.push(<span key={key++} className="text-green-400 font-semibold">{firstMatch.match[1]}</span>);
    }

    remaining = remaining.slice(firstMatch.index + firstMatch.match[0].length);
  }

  return <>{parts}</>;
}

// ── Tool Result Card ──────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: ToolExecution }) {
  const [expanded, setExpanded] = useState(false);
  const result = tool.result;
  const isSuccess = tool.success && !result?.error;

  const getSummary = () => {
    if (result?.error) return result.error;
    if (result?.success === true) {
      if (result.username && result.newBalance !== undefined) return `${result.username}: $${result.oldBalance} → $${result.newBalance}`;
      if (result.username && result.banned !== undefined) return `${result.username} ${result.banned ? "banned" : "unbanned"}`;
      if (result.commitMessage) return `Committed: "${result.commitMessage}"`;
      if (result.message) return result.message;
      if (result.key) return `${result.key} = ${result.value}`;
      return "Success";
    }
    if (result?.users) return `${result.count} users`;
    if (result?.transactions) return `${result.count} transactions`;
    if (result?.bets) return `${result.count} bets`;
    if (result?.totalUsers !== undefined) return `${result.totalUsers} users, $${result.totalDeposited} deposited`;
    if (result?.rows) return `${result.rowCount} rows`;
    if (result?.branch) return `Branch: ${result.branch}`;
    if (result?.alerts) return `${result.count} fraud alerts`;
    if (result?.games) return `${result.games.length} games`;
    return "Completed";
  };

  return (
    <div className={`rounded-lg border text-xs overflow-hidden ${
      isSuccess
        ? "border-purple-500/20 bg-purple-950/20"
        : "border-red-500/20 bg-red-950/20"
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${isSuccess ? "text-purple-300" : "text-red-400"}`}>
          {isSuccess ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <XCircle className="w-3 h-3 flex-shrink-0" />}
          <span className="flex items-center gap-1 font-mono font-medium">
            {getToolIcon(tool.toolName)}
            {getToolLabel(tool.toolName)}
          </span>
          <span className="text-gray-500 truncate ml-1">— {getSummary()}</span>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-gray-600 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-gray-600 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/5">
          <pre className="mt-2 text-[10px] font-mono text-gray-400 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function OwnerAiChat({ token }: OwnerAiChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "**DGC-AI1 online.** I'm your in-house platform intelligence powered by Groq's Llama 3.3 (70B) — connected live to your Neon database, GitHub repo, and Render deployments.\n\nI'm lightning-fast and free to run. I can read and write to the database, manage users and balances, control games, push code commits, trigger deploys, and analyze your platform in real time. Ask me anything or give me a command.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [streamingTools, setStreamingTools] = useState<ToolExecution[]>([]);
  const [currentStreamingId, setCurrentStreamingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognition);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interimText, streamingTools]);

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

    recognition.onstart = () => { setIsListening(true); setError(null); };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }
      if (finalTranscript) {
        setInput(prev => (prev + " " + finalTranscript).trim());
        setInterimText("");
      } else {
        setInterimText(interimTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "aborted") setError(`Voice error: ${event.error}`);
      stopListening();
    };

    recognition.onend = () => { setIsListening(false); setInterimText(""); };

    recognitionRef.current = recognition;
    recognition.start();
  }, [stopListening]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  const sendMessage = useCallback(async (messageText?: string) => {
    const text = (messageText || input).trim();
    if (!text || isLoading) return;

    if (isListening) stopListening();

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setInterimText("");
    setIsLoading(true);
    setError(null);
    setStreamingTools([]);

    const streamingMsgId = `ai-${Date.now()}`;
    setCurrentStreamingId(streamingMsgId);

    // Add placeholder streaming message
    const streamingMsg: Message = {
      id: streamingMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      toolsExecuted: [],
      isStreaming: true,
    };
    setMessages(prev => [...prev, streamingMsg]);

    try {
      const history = [...messages.slice(-15), userMessage]
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role, content: m.content }));

      abortControllerRef.current = new AbortController();

      const response = await fetch("/api/admin/owner-ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: history, stream: true }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      if (!response.body) throw new Error("No response stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // SSE parser: accumulate raw text and parse complete event blocks
      let sseBuffer = "";
      let fullContent = "";
      const executedTools: ToolExecution[] = [];

      const processSSEBuffer = () => {
        // Split on double newline (SSE event separator)
        const eventBlocks = sseBuffer.split("\n\n");
        // Keep the last incomplete block in the buffer
        sseBuffer = eventBlocks.pop() || "";

        for (const block of eventBlocks) {
          if (!block.trim()) continue;
          const lines = block.split("\n");
          let eventType = "";
          let eventData = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6).trim();
          }
          if (!eventType || !eventData) continue;

          try {
            const data = JSON.parse(eventData);
            if (eventType === "token") {
              fullContent += data.content || "";
              setMessages(prev => prev.map(m =>
                m.id === streamingMsgId
                  ? { ...m, content: fullContent, toolsExecuted: [...executedTools] }
                  : m
              ));
            } else if (eventType === "tool_start") {
              setStreamingTools(prev => [...prev, { toolName: data.toolName, result: null, success: false }]);
            } else if (eventType === "tool_result") {
              const toolEntry: ToolExecution = { toolName: data.toolName, result: data.result, success: data.success };
              executedTools.push(toolEntry);
              setStreamingTools(prev =>
                prev.map(t => t.toolName === data.toolName && t.result === null ? toolEntry : t)
              );
              setMessages(prev => prev.map(m =>
                m.id === streamingMsgId ? { ...m, toolsExecuted: [...executedTools] } : m
              ));
            } else if (eventType === "error") {
              throw new Error(data.message || "Stream error");
            } else if (eventType === "done") {
              setMessages(prev => prev.map(m =>
                m.id === streamingMsgId
                  ? { ...m, content: fullContent || "Done.", toolsExecuted: [...executedTools], isStreaming: false }
                  : m
              ));
            }
          } catch (parseErr: any) {
            if (parseErr.message?.includes("Stream error")) throw parseErr;
            // Skip other malformed events
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        processSSEBuffer();
      }
      // Process any remaining buffer
      sseBuffer += "\n\n";
      processSSEBuffer();

      // Ensure message is finalized
      setMessages(prev => prev.map(m =>
        m.id === streamingMsgId
          ? { ...m, content: fullContent || "Done.", toolsExecuted: [...executedTools], isStreaming: false }
          : m
      ));

    } catch (err: any) {
      if (err.name === "AbortError") {
        setMessages(prev => prev.map(m =>
          m.id === streamingMsgId ? { ...m, content: "Response cancelled.", isStreaming: false } : m
        ));
        return;
      }

      setError(err.message || "Failed to get response");
      setMessages(prev => prev.map(m =>
        m.id === streamingMsgId
          ? { ...m, content: `**Error:** ${err.message || "Something went wrong. Please try again."}`, isStreaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
      setCurrentStreamingId(null);
      setStreamingTools([]);
      abortControllerRef.current = null;
    }
  }, [input, isLoading, isListening, messages, token, stopListening]);

  const cancelStream = () => {
    abortControllerRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: `welcome-${Date.now()}`,
      role: "assistant",
      content: "Chat cleared. What do you need?",
      timestamp: new Date(),
    }]);
    setError(null);
  };

  const quickActions = [
    { label: "Platform Stats", action: "Give me a full platform overview — users, revenue, bets, deposits, and pending withdrawals" },
    { label: "All Users", action: "Show me all users with their balances, roles, and deposit totals in a table" },
    { label: "Pending Withdrawals", action: "Show me all pending withdrawal transactions" },
    { label: "Revenue (7 days)", action: "Show me the revenue analytics for the last 7 days broken down by game" },
    { label: "Fix Balances", action: "Run a full balance reconciliation to fix any discrepancies between deposits and balances" },
    { label: "Git Status", action: "Check the current git status of the repository" },
    { label: "Fraud Alerts", action: "Show me all open fraud review cases" },
    { label: "Recent Bets", action: "Show me the 20 most recent bets across all games" },
  ];

  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const chatHeight = isFullscreen ? "h-[calc(100vh-200px)]" : "h-96";

  return (
    <div className={`rounded-xl border border-purple-500/30 bg-gradient-to-b from-purple-950/40 to-black/60 shadow-[0_0_60px_rgba(147,51,234,0.15)] overflow-hidden transition-all duration-300 ${isFullscreen ? "fixed inset-4 z-50 rounded-2xl" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/20 bg-purple-950/30">
        <div className="flex items-center gap-3">
        <div className="relative">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.7)]">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-black animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white tracking-wide">DGC-AI1</span>
                  <span className="text-[10px] font-mono bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/30 font-semibold">⚡ GROQ · LLAMA 3.3 · LIVE</span>
                </div>
                <p className="text-[10px] text-cyan-400/70 font-mono">Free Tier · Lightning Fast · Neon DB · GitHub · Render</p>
              </div>
            </div>
        <div className="flex items-center gap-1">
          <button onClick={clearChat} className="p-1.5 rounded text-purple-400/60 hover:text-purple-300 hover:bg-purple-500/10 transition-colors" title="Clear chat">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 rounded text-purple-400/60 hover:text-purple-300 hover:bg-purple-500/10 transition-colors" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 rounded text-purple-400/60 hover:text-purple-300 hover:bg-purple-500/10 transition-colors">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Quick Actions */}
          <div className="px-4 pt-3 pb-2 flex flex-wrap gap-1.5 border-b border-purple-500/10">
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
          <div className={`${chatHeight} overflow-y-auto px-4 py-3 space-y-4`}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-[0_0_10px_rgba(147,51,234,0.5)]">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div className={`max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1.5`}>
                  {/* Tool execution cards (shown above the response) */}
                  {msg.role === "assistant" && msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                    <div className="w-full space-y-1">
                      {msg.toolsExecuted.map((tool, ti) => (
                        <ToolCard key={ti} tool={tool} />
                      ))}
                    </div>
                  )}

                  {/* Streaming tool indicators */}
                  {msg.isStreaming && streamingTools.length > 0 && (
                    <div className="w-full space-y-1">
                      {streamingTools.filter(t => t.result === null).map((tool, ti) => (
                        <div key={ti} className="flex items-center gap-2 text-xs text-purple-400/70 bg-purple-950/30 border border-purple-500/20 rounded-lg px-3 py-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span className="font-mono">{getToolLabel(tool.toolName)}</span>
                          <span className="text-purple-500/50">running...</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message bubble */}
                  {(msg.content || msg.isStreaming) && (
                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-purple-600/80 text-white rounded-tr-sm"
                          : "bg-white/5 text-gray-200 border border-white/10 rounded-tl-sm"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose-sm max-w-none">
                          {renderMarkdown(msg.content)}
                          {msg.isStreaming && (
                            <span className="inline-block w-1.5 h-4 bg-purple-400 animate-pulse rounded-sm ml-0.5 align-middle" />
                          )}
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  )}

                  <span className="text-[9px] text-gray-600 font-mono px-1">{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            ))}

            {/* Interim voice text */}
            {interimText && (
              <div className="flex gap-2.5 flex-row-reverse">
                <div className="max-w-[85%] items-end flex flex-col gap-1">
                  <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm bg-purple-600/40 text-purple-200 border border-purple-500/30 italic">
                    {interimText}
                    <span className="ml-1 inline-block w-1 h-3.5 bg-purple-400 animate-pulse rounded-sm" />
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator (before first token arrives) */}
            {isLoading && !currentStreamingId && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-purple-400/70 font-mono">Thinking...</span>
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
                  placeholder={isListening ? "Listening... speak now" : "Ask DG AI anything — check stats, fix accounts, push code, deploy..."}
                  rows={1}
                  className={`w-full resize-none rounded-xl border px-3 py-2.5 text-sm bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-1 transition-all ${
                    isListening
                      ? "border-red-500/50 focus:ring-red-500/30 bg-red-950/20"
                      : "border-purple-500/30 focus:ring-purple-500/30"
                  }`}
                  style={{ minHeight: "42px", maxHeight: "160px" }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = Math.min(target.scrollHeight, 160) + "px";
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
                  title={isListening ? "Stop listening" : "Voice input"}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}

              {/* Send / Cancel button */}
              {isLoading ? (
                <button
                  onClick={cancelStream}
                  className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all flex-shrink-0"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim()}
                  className="p-2.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:border-purple-400/50 hover:shadow-[0_0_12px_rgba(147,51,234,0.3)] transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Send"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-[9px] text-gray-600 font-mono mt-1.5 text-center">
              DG AI has full access to your database, GitHub, and Render. All actions are logged.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
