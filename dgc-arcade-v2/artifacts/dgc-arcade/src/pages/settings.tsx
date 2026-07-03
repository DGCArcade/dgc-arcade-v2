import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { User, Shield, Trash2, RefreshCw, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

function getToken() { return localStorage.getItem("dgc_token") ?? ""; }

async function apiCall(path: string, method = "GET", body?: object) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

export default function Settings() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const [meData, setMeData] = useState<any>(null);
  const [newUsername, setNewUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<{ type: "success"|"error"|""; msg: string }>({ type: "", msg: "" });
  const [usernameLoading, setUsernameLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<{ type: "success"|"error"|""; msg: string }>({ type: "", msg: "" });
  const [emailLoading, setEmailLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success"|"error"|""; msg: string }>({ type: "", msg: "" });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<{ type: "success"|"error"|""; msg: string }>({ type: "", msg: "" });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/");
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (isAuthenticated) {
      apiCall("/api/users/me").then(d => {
        setMeData(d);
        if (d.email) setEmail(d.email);
      });
    }
  }, [isAuthenticated]);

  async function handleUsernameChange() {
    if (!newUsername.trim()) return;
    setUsernameLoading(true);
    setUsernameStatus({ type: "", msg: "" });
    try {
      const res = await apiCall("/api/users/me/username", "PATCH", { username: newUsername.trim() });
      if (res.success) {
        setUsernameStatus({ type: "success", msg: `Username changed to @${res.username}! Refresh to see changes.` });
        setNewUsername("");
        setMeData((d: any) => ({ ...d, username: res.username, canChangeUsername: false, daysUntilChange: 90 }));
      } else {
        setUsernameStatus({ type: "error", msg: res.error ?? "Failed to change username" });
      }
    } catch {
      setUsernameStatus({ type: "error", msg: "Network error. Try again." });
    } finally {
      setUsernameLoading(false);
    }
  }

  async function handleEmailUpdate() {
    setEmailLoading(true);
    setEmailStatus({ type: "", msg: "" });
    try {
      const res = await apiCall("/api/users/me/profile", "PATCH", { email: email.trim() });
      if (res.success) {
        setEmailStatus({ type: "success", msg: "Email updated successfully." });
        setMeData((d: any) => ({ ...d, email: res.email, emailVerified: false }));
      } else {
        setEmailStatus({ type: "error", msg: res.error ?? "Failed to update email" });
      }
    } catch {
      setEmailStatus({ type: "error", msg: "Network error. Try again." });
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordChange() {
    if (!currentPassword || !newPassword) return;
    setPasswordLoading(true);
    setPasswordStatus({ type: "", msg: "" });
    try {
      const res = await apiCall("/api/users/me/password", "PATCH", { currentPassword, newPassword });
      if (res.success) {
        setPasswordStatus({ type: "success", msg: "Password changed successfully." });
        setCurrentPassword("");
        setNewPassword("");
      } else {
        setPasswordStatus({ type: "error", msg: res.error ?? "Failed to change password" });
      }
    } catch {
      setPasswordStatus({ type: "error", msg: "Network error. Try again." });
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== user?.username) {
      setDeleteStatus({ type: "error", msg: "Username doesn't match. Type your exact username to confirm." });
      return;
    }
    setDeleteLoading(true);
    try {
      const res = await apiCall("/api/users/me/request-deletion", "POST");
      if (res.success) {
        setDeleteStatus({ type: "success", msg: res.message });
        setShowDeleteConfirm(false);
        setTimeout(() => {
          localStorage.removeItem("dgc_token");
          setLocation("/");
        }, 3000);
      } else {
        setDeleteStatus({ type: "error", msg: res.error ?? "Failed" });
      }
    } catch {
      setDeleteStatus({ type: "error", msg: "Network error. Try again." });
    } finally {
      setDeleteLoading(false);
    }
  }

  if (isLoading || !user) {
    return <div className="flex items-center justify-center min-h-[60vh]"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="border-b border-border/40 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-black text-3xl uppercase tracking-widest">Settings</h1>
            <p className="text-muted-foreground text-sm">Manage your account preferences</p>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <Card className="bg-card border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Shield className="w-4 h-4" /> Account Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-sm text-muted-foreground">Username</span>
            <span className="font-mono font-bold">@{user.username}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-sm text-muted-foreground">Email</span>
            <div className="text-right">
              <div className="font-mono text-sm">{meData?.email || "Not set"}</div>
              {meData?.email && (
                <div className="flex items-center gap-2 justify-end">
                  <Badge variant={meData.emailVerified ? "default" : "outline"} className={`text-[10px] h-4 ${meData.emailVerified ? "bg-green-500/20 text-green-400" : "text-amber-400 border-amber-500/30"}`}>
                    {meData.emailVerified ? "✓ Verified" : "⚠ Unverified"}
                  </Badge>
                  {!meData.emailVerified && (
                    <button
                      onClick={() => {
                        // Open the global verification modal (it handles auto-sending)
                        const event = new CustomEvent('openVerificationModal');
                        window.dispatchEvent(event);
                      }}
                      className="text-[10px] uppercase font-black text-primary hover:underline"
                    >
                      Verify
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant={user.role === "admin" ? "default" : "secondary"} className="text-xs uppercase">
              {user.role === "admin" ? "👑 Admin" : "🎮 Player"}
            </Badge>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-sm text-muted-foreground">Member Since</span>
            <span className="font-mono text-sm">{new Date(user.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-muted-foreground">Username Changes</span>
            {meData?.canChangeUsername
              ? <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Available Now</Badge>
              : <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {meData?.daysUntilChange ?? "—"} days remaining
                </span>
            }
          </div>
        </CardContent>
      </Card>

      {/* Update Email */}
      <Card className="bg-card border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Email Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-secondary border-border/60 font-mono"
            />
            <Button onClick={handleEmailUpdate} disabled={emailLoading} className="font-bold uppercase tracking-wider shrink-0">
              {emailLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Update"}
            </Button>
          </div>
          {emailStatus.msg && (
            <div className={`rounded-lg p-3 flex items-center gap-2 text-xs ${emailStatus.type === "success" ? "bg-green-500/10 border border-green-500/30 text-green-300" : "bg-red-500/10 border border-red-500/30 text-red-300"}`}>
              {emailStatus.type === "success" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
              {emailStatus.msg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="bg-card border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="bg-secondary border-border/60 font-mono"
          />
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="bg-secondary border-border/60 font-mono"
          />
          <Button onClick={handlePasswordChange} disabled={passwordLoading} className="w-full font-bold uppercase tracking-wider">
            {passwordLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Update Password"}
          </Button>
          {passwordStatus.msg && (
            <div className={`rounded-lg p-3 flex items-center gap-2 text-xs ${passwordStatus.type === "success" ? "bg-green-500/10 border border-green-500/30 text-green-300" : "bg-red-500/10 border border-red-500/30 text-red-300"}`}>
              {passwordStatus.type === "success" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
              {passwordStatus.msg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Account */}
      <Card className="bg-card border-border/40 border-red-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-red-400">
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showDeleteConfirm ? (
            <Button onClick={() => setShowDeleteConfirm(true)} variant="destructive" className="w-full font-bold uppercase tracking-wider">
              <Trash2 className="w-4 h-4 mr-2" /> Delete Account
            </Button>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                This action is permanent. Type your username <strong>@{user.username}</strong> to confirm:
              </p>
              <Input
                type="text"
                placeholder={`@${user.username}`}
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                className="bg-secondary border-border/60 font-mono"
              />
              <div className="flex gap-2">
                <Button onClick={handleDeleteAccount} disabled={deleteLoading || deleteConfirm !== user?.username} variant="destructive" className="flex-1 font-bold uppercase tracking-wider">
                  {deleteLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Confirm Delete"}
                </Button>
                <Button onClick={() => setShowDeleteConfirm(false)} variant="outline" className="flex-1 font-bold uppercase tracking-wider">
                  Cancel
                </Button>
              </div>
              {deleteStatus.msg && (
                <div className={`rounded-lg p-3 flex items-center gap-2 text-xs ${deleteStatus.type === "success" ? "bg-green-500/10 border border-green-500/30 text-green-300" : "bg-red-500/10 border border-red-500/30 text-red-300"}`}>
                  {deleteStatus.type === "success" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                  {deleteStatus.msg}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
