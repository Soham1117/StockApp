'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSavedScreens } from '@/hooks/use-saved-screens';
import { ScreenCard } from '@/components/saved-screens/screen-card';
import { PortfolioOverviewCard } from '@/components/portfolio/portfolio-overview-card';
import { useRouter } from 'next/navigation';

type AuthUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  createdAt?: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const { screens, remove, update } = useSavedScreens();

  const [profileEmail, setProfileEmail] = useState('');
  const [profileFirst, setProfileFirst] = useState('');
  const [profileLast, setProfileLast] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState('');
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);

  const formatError = (detail: unknown): string => {
    if (!detail) return 'Authentication failed';
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const first = detail[0] as { msg?: string; loc?: unknown[] } | undefined;
      if (first?.msg) return first.msg;
    }
    if (typeof detail === 'object' && 'detail' in (detail as Record<string, unknown>)) {
      return formatError((detail as Record<string, unknown>).detail);
    }
    return 'Authentication failed';
  };

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        return data.user as AuthUser;
      })
      .then((data) => {
        setUser(data);
        if (data) {
          setProfileEmail(data.email || '');
          setProfileFirst(data.firstName || '');
          setProfileLast(data.lastName || '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!emailRe.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (mode === 'register') {
      if (!firstName.trim() || !lastName.trim()) {
        setError('First and last name are required');
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          ...(mode === 'register' ? { first_name: firstName, last_name: lastName } : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(formatError(detail));
      }
      const data = await res.json();
      setUser(data.user as AuthUser);
      setPassword('');
      setFirstName('');
      setLastName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  const handleProfileSave = async () => {
    setProfileError('');
    setProfileSaved('');
    if (!emailRe.test(profileEmail.trim())) {
      setProfileError('Enter a valid email address');
      return;
    }
    if (!profileFirst.trim() || !profileLast.trim()) {
      setProfileError('First and last name are required');
      return;
    }
    setProfileSaving(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: profileEmail,
          first_name: profileFirst,
          last_name: profileLast,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(formatError(detail));
      }
      const data = await res.json();
      setUser(data.user as AuthUser);
      setProfileSaved('Profile updated');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    setPasswordError('');
    setPasswordSaved('');
    if (newPassword.trim().length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(formatError(detail));
      }
      setPasswordSaved('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Profile & Settings</h2>
            {user ? (
              <Button onClick={handleLogout} variant="outline">
                Sign out
              </Button>
            ) : null}
          </div>

          {loading ? (
            <p className="text-muted-foreground">Loading.</p>
          ) : user ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="p-4 space-y-3" variant="dense">
                  <h3 className="text-sm font-semibold">Account Details</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="profile-first-name">First Name</Label>
                      <Input
                        id="profile-first-name"
                        value={profileFirst}
                        onChange={(e) => setProfileFirst(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="profile-last-name">Last Name</Label>
                      <Input
                        id="profile-last-name"
                        value={profileLast}
                        onChange={(e) => setProfileLast(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input
                      id="profile-email"
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                    />
                  </div>
                  {profileError ? <div className="text-sm text-destructive">{profileError}</div> : null}
                  {profileSaved ? <div className="text-sm text-emerald-500">{profileSaved}</div> : null}
                  <Button onClick={handleProfileSave} disabled={profileSaving}>
                    {profileSaving ? 'Saving...' : 'Save Profile'}
                  </Button>
                </Card>

                <Card className="p-4 space-y-3" variant="dense">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Change Password</h3>
                    {passwordUnlocked ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPasswordUnlocked(false);
                          setPasswordError('');
                          setPasswordSaved('');
                          setCurrentPassword('');
                          setNewPassword('');
                          setConfirmPassword('');
                        }}
                      >
                        Lock
                      </Button>
                    ) : null}
                  </div>

                  {!passwordUnlocked ? (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        Enter your current password to unlock changes.
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="password-unlock">Current Password</Label>
                        <Input
                          id="password-unlock"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                      </div>
                      <Button
                        onClick={() => {
                          if (!currentPassword.trim()) {
                            setPasswordError('Enter your current password');
                            return;
                          }
                          setPasswordError('');
                          setPasswordUnlocked(true);
                        }}
                        variant="outline"
                      >
                        Unlock
                      </Button>
                      {passwordError ? <div className="text-sm text-destructive">{passwordError}</div> : null}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="password-current">Current Password</Label>
                        <Input
                          id="password-current"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="password-new">New Password</Label>
                        <Input
                          id="password-new"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="password-confirm">Confirm New Password</Label>
                        <Input
                          id="password-confirm"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                      </div>
                      {passwordError ? <div className="text-sm text-destructive">{passwordError}</div> : null}
                      {passwordSaved ? <div className="text-sm text-emerald-500">{passwordSaved}</div> : null}
                      <Button onClick={handlePasswordSave} disabled={passwordSaving}>
                        {passwordSaving ? 'Saving...' : 'Update Password'}
                      </Button>
                    </>
                  )}
                </Card>
              </div>

              <PortfolioOverviewCard />

              <Card className="p-4 space-y-3" variant="dense">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Saved Screens</h3>
                  <Button variant="outline" size="sm" onClick={() => router.push('/saved-screens')}>
                    Manage
                  </Button>
                </div>
                {screens.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No saved screens yet.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {screens.slice(0, 4).map((screen) => (
                      <ScreenCard
                        key={screen.id}
                        screen={screen}
                        onLoad={() => {
                          const industry = screen.filters.industry || 'Technology';
                          router.push(`/industry/${encodeURIComponent(industry)}/analysis?screen=${screen.id}`);
                        }}
                        onDelete={remove}
                        onRename={(id, name) => update(id, { name })}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === 'login' ? 'default' : 'outline'}
                  onClick={() => setMode('login')}
                >
                  Login
                </Button>
                <Button
                  type="button"
                  variant={mode === 'register' ? 'default' : 'outline'}
                  onClick={() => setMode('register')}
                >
                  Register
                </Button>
              </div>

              <div className="space-y-3 max-w-sm">
                {mode === 'register' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="auth-first-name">First Name</Label>
                      <Input
                        id="auth-first-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="auth-last-name">Last Name</Label>
                      <Input
                        id="auth-last-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last"
                      />
                    </div>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="auth-email">Email</Label>
                  <Input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="auth-password">Password</Label>
                  <Input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                {error ? <div className="text-sm text-destructive">{error}</div> : null}
                <Button onClick={handleSubmit} disabled={submitting || !email || !password}>
                  {submitting ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
