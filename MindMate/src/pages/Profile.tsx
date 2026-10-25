import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAppContext } from '../context/AppContext';
import { UserRound, Save, Sparkles, Target, BookOpen } from 'lucide-react';

const AVATARS = [
  'The Focused', 'The Coder', 'The Planner', 'The Reader', 'The Music Lover',
  'The Dreamer', 'The Productive', 'The Chill Buddy', 'The Curious', 'The Artist',
  'The Explorer', 'The Leader', 'The Night Owl', 'The Healthy', 'The Minimalist',
  'The Gamer Learner', 'The Aesthetic', 'The Calm Mind', 'The Scholar', 'MindMate AI'
].map((label, index) => ({
  label,
  src: `/avatars/avatar-${String(index + 1).padStart(2, '0')}.webp`
}));

export default function Profile() {
  const { user, updateUser, showToast } = useAppContext();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [goal, setGoal] = useState(user?.goal || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(user?.avatar || '/avatars/avatar-01.webp');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setGoal(user.goal || '');
      setBio(user.bio || '');
      setAvatar(user.avatar || '/avatars/avatar-01.webp');
    }
  }, [user]);

  const saveProfile = async () => {
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      showToast('Please enter your name.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await updateUser({
        name: cleanName,
        goal: goal.trim(),
        bio: bio.trim(),
        avatar,
      });
      showToast('Your MindMate profile has been updated.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update profile.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedAvatarObj = AVATARS.find(a => a.src === avatar);

  return (
    <AppShell pageTitle="My Profile" pageSubtitle="Your identity, study style, and learning goals">
      <div className="mx-auto max-w-5xl space-y-6 pb-8">
        {/* Profile Hero Banner */}
        <div className="profile-hero relative overflow-hidden rounded-2xl p-6 text-white shadow-lg">
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="profile-avatar-orb h-16 w-16 shrink-0 sm:h-20 sm:w-20 overflow-hidden rounded-2xl border-2 border-white/40 bg-white/15 shadow-2xl backdrop-blur">
              <img
                src={avatar.startsWith('/avatars/') ? avatar : '/avatars/avatar-01.webp'}
                alt="Selected study avatar"
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
                LEARNER IDENTITY
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold">{name.trim() || 'Alex Learner'}</h2>
              <p className="mt-1 text-sm text-white/80">{email || 'Logged in learner'}</p>
              {goal && (
                <p className="mt-2 text-xs text-white/90 font-medium flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" /> Goal: {goal}
                </p>
              )}
            </div>
          </div>
          <div className="profile-aurora-orb profile-aurora-orb-one" />
          <div className="profile-aurora-orb profile-aurora-orb-two" />
        </div>

        {/* Profile Details Card */}
        <Card className="overflow-hidden p-0 border border-border shadow-sm">
          <div className="border-b border-border p-6 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-dark">Profile Details</h3>
                <p className="text-sm text-muted">Choose your persona and how your details appear in MindMate.</p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-6">
            {/* Avatar Selector */}
            <div>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-dark">Choose Your Study Avatar</p>
                  <p className="mt-0.5 text-xs text-muted">20 illustrated identities made for MindMate learners.</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {selectedAvatarObj?.label || 'Selected Avatar'}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
                {AVATARS.map((item) => {
                  const isSelected = avatar === item.src;
                  return (
                    <button
                      key={item.src}
                      type="button"
                      onClick={() => setAvatar(item.src)}
                      aria-label={`Choose ${item.label} avatar`}
                      className={`group overflow-hidden rounded-xl border text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/50 shadow-md'
                          : 'border-border hover:border-primary/60'
                      }`}
                    >
                      <div className="relative h-14 overflow-hidden bg-slate-950">
                        <img
                          src={item.src}
                          alt={item.label}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                        {isSelected && (
                          <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-bold text-white">
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="bg-background px-1 py-1 text-center text-[10px] font-semibold text-dark truncate">
                        {item.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Input fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Full Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full rounded-xl border border-border bg-gray-100/80 dark:bg-slate-800/80 px-3.5 py-2.5 text-sm text-muted cursor-not-allowed outline-none"
                />
                <span className="text-[11px] text-muted mt-1 block">Email is bound to your Supabase login account.</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">Learning Goal</label>
                <input
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Master Data Structures & Algorithms"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">Bio / About You</label>
                <input
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A short note about your study journey"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border shadow-sm">
                  <img
                    src={avatar.startsWith('/avatars/') ? avatar : '/avatars/avatar-01.webp'}
                    alt="Selected avatar preview"
                    className="h-full w-full object-cover"
                  />
                </span>
                <div>
                  <p className="font-semibold text-dark text-sm">{name.trim() || 'Your Name'}</p>
                  <p className="text-xs text-muted">{selectedAvatarObj?.label || 'Custom Persona'}</p>
                </div>
              </div>

              <Button
                onClick={saveProfile}
                disabled={isSaving}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
