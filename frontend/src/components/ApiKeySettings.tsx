import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, Sparkles, CheckCircle2, ShieldCheck, Cpu, Key } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, API_ENDPOINTS } from '@/lib/api';

export function ApiKeySettings() {
  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in current password, new password, and confirmation password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation password do not match.');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long.');
      return;
    }

    setChangingPassword(true);
    try {
      await apiClient.post(API_ENDPOINTS.auth.changePassword, {
        old_password: oldPassword,
        new_password: newPassword,
      });

      toast.success('Password updated successfully! 🎉', {
        description: 'Your account credentials have been secured.',
      });

      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to update password.';
      toast.error('Password change failed', { description: detail });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Cpu className="w-8 h-8 text-primary" />
          AI Engine & Account Security
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your account credentials and view your active backend LLM processing engine.
        </p>
      </div>

      {/* Backend Gemini Engine Status Banner */}
      <Card variant="glass" className="border-primary/20 bg-gradient-to-r from-primary/10 via-card to-card">
        <CardHeader className="pb-4 border-b border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-inner">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <span>Google Gemini LLM</span>
                  <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/40 text-emerald-400 text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Active on Server
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Backend Automated Intelligence Engine
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary" className="font-mono text-xs self-start sm:self-auto py-1 px-2.5">
              gemini-2.0-flash / gemini-1.5-flash
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <p className="text-sm text-foreground/90 leading-relaxed">
            AI analysis, resume intelligence, skill classification, and personalized cover letters are powered securely by the backend Gemini API key. Client-side API key upload is disabled for enhanced security and automated performance.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Resume Parsing
              </span>
              <p className="text-[11px] text-muted-foreground">
                Automatic skill extraction, contact discovery, and experience parsing.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ATS Match Scoring
              </span>
              <p className="text-[11px] text-muted-foreground">
                Algorithmic alignment with active recruiter job descriptions.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1 sm:col-span-2 md:col-span-1">
              <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Cover Letter Generation
              </span>
              <p className="text-[11px] text-muted-foreground">
                Context-aware letters personalized to the company and role.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Security: Change Password Card */}
      <Card variant="glass" className="border-white/10">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Account Password Security
          </CardTitle>
          <CardDescription>
            Update your account password. Enter your current password followed by your new password and confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
            {/* Field 1: Old Password */}
            <div className="space-y-1.5">
              <Label htmlFor="old-password" className="text-xs font-semibold uppercase text-muted-foreground">
                Current Password *
              </Label>
              <Input
                id="old-password"
                type="password"
                placeholder="Enter current password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                className="bg-black/30 border-white/15"
              />
            </div>

            {/* Field 2: New Password */}
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs font-semibold uppercase text-muted-foreground">
                New Password *
              </Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password (min. 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="bg-black/30 border-white/15"
              />
            </div>

            {/* Field 3: Confirm Password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs font-semibold uppercase text-muted-foreground">
                Confirm New Password *
              </Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="bg-black/30 border-white/15"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={changingPassword}
                variant="hero"
                className="gap-2 shadow-lg shadow-primary/25"
              >
                {changingPassword ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Update Password</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ApiKeySettings;
