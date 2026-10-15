import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, EyeOff, Save, CheckCircle, AlertCircle, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, API_ENDPOINTS } from '@/lib/api';

interface ApiKeys {
  gemini: string;
  groq: string;
  openai: string;
}

export function ApiKeySettings() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    gemini: '',
    groq: '',
    openai: '',
  });

  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [showKeys, setShowKeys] = useState<Record<keyof ApiKeys, boolean>>({
    gemini: false,
    groq: false,
    openai: false,
  });

  const [savedKeys, setSavedKeys] = useState<Record<keyof ApiKeys, boolean>>({
    gemini: false,
    groq: false,
    openai: false,
  });

  // Load saved API keys from localStorage on mount
  useEffect(() => {
    const savedGemini = localStorage.getItem('GEMINI_API_KEY');
    const savedGroq = localStorage.getItem('GROQ_API_KEY');
    const savedOpenAI = localStorage.getItem('OPENAI_API_KEY');

    if (savedGemini) {
      setApiKeys(prev => ({ ...prev, gemini: savedGemini }));
      setSavedKeys(prev => ({ ...prev, gemini: true }));
    }
    if (savedGroq) {
      setApiKeys(prev => ({ ...prev, groq: savedGroq }));
      setSavedKeys(prev => ({ ...prev, groq: true }));
    }
    if (savedOpenAI) {
      setApiKeys(prev => ({ ...prev, openai: savedOpenAI }));
      setSavedKeys(prev => ({ ...prev, openai: true }));
    }
  }, []);

  const handleSaveKey = (provider: keyof ApiKeys) => {
    const key = apiKeys[provider].trim();
    
    if (!key) {
      toast.error(`Please enter a ${provider.toUpperCase()} API key`);
      return;
    }

    // Save to localStorage
    localStorage.setItem(`${provider.toUpperCase()}_API_KEY`, key);
    setSavedKeys(prev => ({ ...prev, [provider]: true }));
    
    toast.success(`${provider.toUpperCase()} API key saved successfully!`, {
      description: 'Your API key has been securely stored',
    });
  };

  const handleRemoveKey = (provider: keyof ApiKeys) => {
    localStorage.removeItem(`${provider.toUpperCase()}_API_KEY`);
    setApiKeys(prev => ({ ...prev, [provider]: '' }));
    setSavedKeys(prev => ({ ...prev, [provider]: false }));
    
    toast.info(`${provider.toUpperCase()} API key removed`);
  };

  const toggleShowKey = (provider: keyof ApiKeys) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

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
      const resp = await apiClient.post(API_ENDPOINTS.auth.changePassword, {
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      toast.success(resp.data?.message || 'Password changed successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to change password. Please check your old password.';
      toast.error(detail);
    } finally {
      setChangingPassword(false);
    }
  };

  const renderApiKeyInput = (
    provider: keyof ApiKeys,
    title: string,
    description: string,
    documentationUrl: string
  ) => {
    const isKeySet = savedKeys[provider];
    const showKey = showKeys[provider];

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {title}
            {isKeySet && (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
          </CardTitle>
          <CardDescription>
            {description}{' '}
            <a
              href={documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Get API Key →
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${provider}-key`}>API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id={`${provider}-key`}
                  type={showKey ? 'text' : 'password'}
                  value={apiKeys[provider]}
                  onChange={(e) =>
                    setApiKeys(prev => ({ ...prev, [provider]: e.target.value }))
                  }
                  placeholder={`Enter your ${title} API key`}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => toggleShowKey(provider)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <Button
                onClick={() => handleSaveKey(provider)}
                disabled={!apiKeys[provider].trim()}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
          </div>

          {isKeySet && (
            <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span>API key is configured and ready to use</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveKey(provider)}
                className="text-destructive hover:text-destructive"
              >
                Remove
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">API Configuration</h1>
        <p className="text-muted-foreground">
          Configure your AI service API keys for cover letter generation. You need at least one API key to use the automation features.
        </p>
      </div>

      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Your API keys are stored locally</p>
          <p className="text-sm text-muted-foreground">
            API keys are saved in your browser's local storage and are never sent to our servers. 
            They are only used to communicate directly with the AI service providers.
          </p>
        </div>
      </div>

      <Tabs defaultValue="gemini" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="gemini" className="gap-2">
            {savedKeys.gemini && <CheckCircle className="h-4 w-4" />}
            Google Gemini
          </TabsTrigger>
          <TabsTrigger value="groq" className="gap-2">
            {savedKeys.groq && <CheckCircle className="h-4 w-4" />}
            Groq
          </TabsTrigger>
          <TabsTrigger value="openai" className="gap-2">
            {savedKeys.openai && <CheckCircle className="h-4 w-4" />}
            OpenAI
          </TabsTrigger>
          <TabsTrigger value="password" className="gap-2">
            <Lock className="h-4 w-4" />
            Change Password
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gemini">
          {renderApiKeyInput(
            'gemini',
            'Google Gemini',
            'Use Google Gemini AI for generating personalized cover letters.',
            'https://makersuite.google.com/app/apikey'
          )}
        </TabsContent>

        <TabsContent value="groq">
          {renderApiKeyInput(
            'groq',
            'Groq',
            'Use Groq AI for ultra-fast cover letter generation.',
            'https://console.groq.com/keys'
          )}
        </TabsContent>

        <TabsContent value="openai">
          {renderApiKeyInput(
            'openai',
            'OpenAI',
            'Use OpenAI GPT models for intelligent cover letter generation.',
            'https://platform.openai.com/api-keys'
          )}
        </TabsContent>

        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your account password. Enter your current password followed by your new password and confirmation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
                {/* 1st Field: Old Password */}
                <div className="space-y-2">
                  <Label htmlFor="old-password">Old Password *</Label>
                  <Input
                    id="old-password"
                    type="password"
                    placeholder="Enter current password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                  />
                </div>

                {/* 2nd Field: New Password */}
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password *</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Enter new password (min. 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                {/* 3rd Field: Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password *</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={changingPassword}
                    className="gap-2"
                  >
                    {changingPassword ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Updating Password...
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        Update Password
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardHeader>
          <CardTitle className="text-lg">💡 Pro Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• <strong>Gemini:</strong> Free tier available with generous quotas (recommended for getting started)</p>
          <p>• <strong>Groq:</strong> Extremely fast inference, great for high-volume applications</p>
          <p>• <strong>OpenAI:</strong> Industry-leading quality, best for professional applications</p>
          <p>• You can configure multiple providers and switch between them</p>
          <p>• Keep your API keys secure and never share them publicly</p>
        </CardContent>
      </Card>
    </div>
  );
}
