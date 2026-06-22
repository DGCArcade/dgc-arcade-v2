import React, { Component, ErrorInfo, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
          <Card className="max-w-md w-full p-8 border-destructive/50 bg-destructive/5 flex flex-col items-center gap-6 backdrop-blur-sm">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            
            <div className="space-y-2">
              <h2 className="font-display font-black text-2xl uppercase tracking-widest text-destructive">
                Game Crash
              </h2>
              <p className="text-muted-foreground text-sm">
                Something went wrong while rendering this game. This can happen due to connection issues or unexpected data.
              </p>
            </div>

            {this.state.error && (
              <div className="w-full p-3 bg-black/40 rounded border border-white/5 text-left overflow-hidden">
                <p className="text-[10px] font-mono text-destructive/80 uppercase mb-1">Error Log</p>
                <p className="text-xs font-mono text-white/60 truncate">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <Button 
              onClick={this.handleReset}
              variant="outline" 
              className="font-bold uppercase tracking-widest gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Game
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
