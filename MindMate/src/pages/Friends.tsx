import React, { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { friends as sampleFriends } from '../data/mockData';
import {
  Flame, Swords, Plus, Mail, MessageCircle, Trophy, Users, Gift, Copy,
  CheckCircle2, Clock3, Star, BookOpen, Medal, UserPlus, UserCheck,
  X, Check, UserMinus, Search, RefreshCw, Send, AlertCircle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
  getFriendsList,
  getPendingRequests,
  getSentRequests,
  sendFriendRequest,
  respondToFriendRequest,
  cancelFriendRequest,
  removeFriend,
  searchProfiles,
  FriendRequestData
} from '../lib/db';

type Tab = 'friends' | 'battle' | 'rewards' | 'invite';
type FriendsSubTab = 'network' | 'pending' | 'discover';
type Question = { question: string; options: string[]; correct: number; explanation: string };
type BattleHistory = { id: string; friend: string; yours: number; theirs: number; xp: number; date: string; result: 'Won' | 'Tie' | 'Practice' };

const questions: Question[] = [
  { question: 'Which data structure follows FIFO?', options: ['Stack', 'Queue', 'Tree', 'Graph'], correct: 1, explanation: 'A queue follows First In, First Out (FIFO).' },
  { question: 'Which language is commonly used with React?', options: ['TypeScript', 'SQL only', 'Bash only', 'Assembly only'], correct: 0, explanation: 'React commonly uses JavaScript or TypeScript.' },
  { question: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Personal Utility', 'Control Program User', 'Central Print Unit'], correct: 0, explanation: 'CPU means Central Processing Unit.' },
  { question: 'Which one is a Python collection type?', options: ['list', 'compile', 'kernel', 'pixel'], correct: 0, explanation: 'A list stores an ordered collection of items in Python.' },
  { question: 'What is the main purpose of a database?', options: ['Store and organize data', 'Cool the CPU', 'Style a webpage', 'Increase screen brightness'], correct: 0, explanation: 'Databases store, organize, and retrieve data.' },
  { question: 'Which protocol is used to load secure websites?', options: ['FTP', 'HTTPS', 'SMTP', 'ARP'], correct: 1, explanation: 'HTTPS secures web communication using TLS.' },
  { question: 'What does AI stand for?', options: ['Automated Internet', 'Artificial Intelligence', 'Advanced Input', 'Applied Interface'], correct: 1, explanation: 'AI means Artificial Intelligence.' },
  { question: 'Which CSS property changes text size?', options: ['font-size', 'text-style', 'font-weight-only', 'letter-case'], correct: 0, explanation: 'The CSS font-size property controls text size.' },
  { question: 'Which SQL command reads data?', options: ['SELECT', 'PAINT', 'MOVE', 'DISPLAY-PIXEL'], correct: 0, explanation: 'SELECT retrieves rows from a database.' },
  { question: 'Which practice usually helps learning most?', options: ['Never reviewing', 'Spaced practice', 'Only guessing', 'Studying without breaks forever'], correct: 1, explanation: 'Spaced practice helps strengthen long-term memory.' },
];

const STORAGE_KEY = 'mindmate_study_together_v1';
const readSaved = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { xp: 0, history: [], referralCount: 0, joinedInvites: [] };
  } catch { return { xp: 0, history: [], referralCount: 0, joinedInvites: [] }; }
};

export default function Friends() {
  const { user, showToast } = useAppContext();
  const [tab, setTab] = useState<Tab>('friends');
  const [friendsSubTab, setFriendsSubTab] = useState<FriendsSubTab>('network');

  // Friends & networking state
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingReceived, setPendingReceived] = useState<FriendRequestData[]>([]);
  const [pendingSent, setPendingSent] = useState<FriendRequestData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(true);

  // Invite tab state
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [copied, setCopied] = useState(false);

  // Battle quiz state
  const [saved, setSaved] = useState(readSaved);
  const [battleFriend, setBattleFriend] = useState<string | null>(null);
  const [battleIndex, setBattleIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [battleFinished, setBattleFinished] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);

  // Load friends and pending requests
  const refreshFriends = async () => {
    if (!user) return;
    try {
      setLoadingFriends(true);
      const [friendsRes, recRes, sentRes] = await Promise.all([
        getFriendsList(user.id),
        getPendingRequests(user.id),
        getSentRequests(user.id)
      ]);

      if (friendsRes.data && friendsRes.data.length > 0) {
        setFriends(friendsRes.data);
      } else {
        // Fallback default friends
        setFriends(sampleFriends);
      }

      setPendingReceived((recRes.data as any) || []);
      setPendingSent((sentRes.data as any) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFriends(false);
    }
  };

  useEffect(() => {
    refreshFriends();
  }, [user]);

  // Search users for networking
  useEffect(() => {
    if (!searchQuery.trim() || !user) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchProfiles(searchQuery, user.id);
        const allDiscovered = (res.data || []).filter(
          (u: any) => !friends.some(f => f.id === u.id)
        );
        setSearchResults(allDiscovered);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, user, friends]);

  const referralCode = useMemo(() => {
    let code = localStorage.getItem('mindmate_referral_code');
    if (!code) {
      code = 'LEARN' + Math.random().toString(36).slice(2, 7).toUpperCase();
      localStorage.setItem('mindmate_referral_code', code);
    }
    return code;
  }, []);

  // Filtered friends list
  const filteredFriends = useMemo(() => {
    return friends.filter((f: any) =>
      `${f.name} ${f.subject || ''}`.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [friends, searchQuery]);

  // Friend actions
  const handleSendRequest = async (targetUser: any) => {
    if (!user) return;
    if (targetUser.id === user.id) {
      showToast('You cannot send a friend request to yourself.', 'error');
      return;
    }
    if (pendingSent.some(r => r.receiver_id === targetUser.id)) {
      showToast('Friend request is already pending.', 'info');
      return;
    }

    try {
      const res = await sendFriendRequest(user, targetUser);
      if (res.data) {
        setPendingSent(prev => [...prev, res.data]);
        showToast(`Friend request sent to ${targetUser.name}!`, 'success');
      }
    } catch {
      showToast('Failed to send friend request.', 'error');
    }
  };

  const handleAcceptRequest = async (request: FriendRequestData) => {
    if (!user) return;
    try {
      await respondToFriendRequest(request.id, 'accepted', user.id, request.sender);
      setPendingReceived(prev => prev.filter(r => r.id !== request.id));
      if (request.sender) {
        setFriends(prev => [...prev, {
          id: request.sender?.id,
          name: request.sender?.name,
          email: request.sender?.email,
          avatar: request.sender?.avatar || '/avatars/avatar-01.webp',
          streak: request.sender?.streak ?? 8,
          mastery: request.sender?.overall_mastery ?? 72,
          subject: 'Computer Science'
        }]);
      }
      showToast(`Accepted ${request.sender?.name || 'user'}'s study request!`, 'success');
    } catch {
      showToast('Failed to accept request.', 'error');
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!user) return;
    try {
      await respondToFriendRequest(requestId, 'rejected', user.id);
      setPendingReceived(prev => prev.filter(r => r.id !== requestId));
      showToast('Declined friend request.', 'info');
    } catch {
      showToast('Failed to decline request.', 'error');
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!user) return;
    try {
      await cancelFriendRequest(requestId, user.id);
      setPendingSent(prev => prev.filter(r => r.id !== requestId));
      showToast('Cancelled friend request.', 'info');
    } catch {
      showToast('Failed to cancel request.', 'error');
    }
  };

  const handleRemoveFriend = async (friendId: string, friendName: string) => {
    if (!user) return;
    setFriends(prev => prev.filter(f => f.id !== friendId));
    try {
      await removeFriend(friendId, user.id);
      showToast(`Removed ${friendName} from study network.`, 'info');
    } catch {
      showToast('Failed to remove friend.', 'error');
    }
  };

  // Battle quiz calculations
  const currentQuestion = questions[battleIndex];
  const userScore = answers.reduce((sum, answer, index) => sum + (answer === questions[index]?.correct ? 1 : 0), 0);
  const opponent = friends.find((f: any) => f.name === battleFriend) || sampleFriends[0];
  const opponentScore = opponent ? Math.max(0, Math.min(questions.length, Math.round(((opponent.mastery || 70) / 100) * questions.length))) : 0;
  const xpEarned = userScore * 10 + (userScore > opponentScore ? 50 : userScore === opponentScore ? 20 : 0);
  const result = userScore > opponentScore ? 'Won' : userScore === opponentScore ? 'Tie' : 'Practice';

  const startBattle = (name: string) => {
    setBattleFriend(name);
    setBattleIndex(0);
    setAnswers([]);
    setSelected(null);
    setBattleFinished(false);
    setTab('battle');
    showToast(`Started 10-question battle with ${name}!`, 'info');
  };

  const nameFor = (name: string | null) => name || 'Study Partner';

  const submitAnswer = () => {
    if (selected === null) {
      showToast('Choose an answer first.', 'error');
      return;
    }
    const nextAnswers = [...answers, selected];
    setAnswers(nextAnswers);
    setSelected(null);
    if (battleIndex === questions.length - 1) {
      const finalScore = nextAnswers.reduce((sum, answer, index) => sum + (answer === questions[index].correct ? 1 : 0), 0);
      const rival = opponent ? Math.max(0, Math.min(questions.length, Math.round(((opponent.mastery || 70) / 100) * questions.length))) : 0;
      const earned = finalScore * 10 + (finalScore > rival ? 50 : finalScore === rival ? 20 : 0);
      const finalResult = finalScore > rival ? 'Won' : finalScore === rival ? 'Tie' : 'Practice';
      setSaved((old: any) => ({
        ...old,
        xp: (old.xp || 0) + earned,
        history: [{
          id: `${Date.now()}`,
          friend: nameFor(battleFriend),
          yours: finalScore,
          theirs: rival,
          xp: earned,
          date: new Date().toLocaleDateString(),
          result: finalResult
        }, ...(old.history || [])].slice(0, 20),
      }));
      setBattleFinished(true);
    } else {
      setBattleIndex((i) => i + 1);
    }
  };

  // Invite actions
  const sendEmailInvite = () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showToast('Enter a valid email address.', 'error');
      return;
    }
    const inviteUrl = `${window.location.origin}/register?ref=${referralCode}`;
    const subject = encodeURIComponent('Join me on MindMate and let’s learn together!');
    const body = encodeURIComponent(`Hi${inviteName.trim() ? ` ${inviteName.trim()}` : ''},\n\nI’m inviting you to join me on MindMate — an AI-powered learning space where we can practise, challenge each other, and earn learning XP.\n\nJoin here: ${inviteUrl}\nMy referral code: ${referralCode}\n\nOnce you join, let’s start a study challenge!\n\nSee you there.`);
    window.location.href = `mailto:${encodeURIComponent(email.trim())}?subject=${subject}&body=${body}`;
    showToast('Your email draft is prepared.', 'success');
  };

  const sendWhatsAppInvite = () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) {
      showToast('Enter a valid phone number with country code.', 'error');
      return;
    }
    const inviteUrl = `${window.location.origin}/register?ref=${referralCode}`;
    const message = encodeURIComponent(`Join me on MindMate! We can learn together, challenge each other and earn XP. Sign up here: ${inviteUrl} | Referral code: ${referralCode}`);
    window.open(`https://wa.me/${digits}?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  const copyReferral = async () => {
    const text = `${window.location.origin}/register?ref=${referralCode}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast('Referral link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(`Referral code: ${referralCode}`, 'success');
    }
  };

  const totalPending = pendingReceived.length;

  return (
    <AppShell pageTitle="Learn Together" pageSubtitle="Study with friends, challenge peers in adaptive duels, and level up">
      <div className="max-w-5xl space-y-6">

        {/* Hero Banner (Theme-Consistent) */}
        <Card className="overflow-hidden border-border bg-gradient-to-br from-indigo-50/70 via-surface to-purple-50/70 dark:from-indigo-950/30 dark:via-surface dark:to-purple-950/20 p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="inline-flex rounded-2xl bg-surface p-4 shadow-sm border border-border">
              <Swords className="h-10 w-10 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="mb-2 text-2xl font-bold text-dark">
                Learn Together. Win Together.
              </h2>
              <p className="max-w-2xl text-muted text-sm">
                Connect with study peers, test your knowledge in 10-question Adaptive Battles, and earn XP milestones together.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-primary border border-border flex items-center">
                  <Star className="mr-1.5 inline h-3.5 w-3.5" />{saved.xp} XP earned
                </span>
                <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-dark border border-border flex items-center">
                  <Trophy className="mr-1.5 inline h-3.5 w-3.5 text-amber-500" />{saved.history?.length || 0} duels completed
                </span>
                {totalPending > 0 && (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20 flex items-center">
                    <UserPlus className="mr-1.5 inline h-3.5 w-3.5" />{totalPending} pending request{totalPending > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Main Tab Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          {([
            { id: 'friends' as Tab, label: 'Friends & Network', icon: Users, badge: totalPending > 0 ? totalPending : undefined },
            { id: 'battle' as Tab, label: 'Adaptive Battle', icon: Swords, badge: undefined },
            { id: 'rewards' as Tab, label: 'XP & Rewards', icon: Medal, badge: undefined },
            { id: 'invite' as Tab, label: 'Invite Friends', icon: Gift, badge: undefined },
          ]).map((item) => {
            const Icon = item.icon;
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface text-muted hover:text-dark hover:bg-gray-50 border border-border'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-1 rounded-full bg-danger text-white text-[10px] px-1.5 py-0.2 font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: FRIENDS & NETWORK */}
        {tab === 'friends' && (
          <div className="space-y-5">
            {/* Sub-nav filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFriendsSubTab('network')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    friendsSubTab === 'network'
                      ? 'bg-surface text-primary border border-primary shadow-xs'
                      : 'text-muted hover:text-dark'
                  }`}
                >
                  My Network ({friends.length})
                </button>
                <button
                  onClick={() => setFriendsSubTab('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    friendsSubTab === 'pending'
                      ? 'bg-surface text-primary border border-primary shadow-xs'
                      : 'text-muted hover:text-dark'
                  }`}
                >
                  Pending Requests
                  {(pendingReceived.length + pendingSent.length) > 0 && (
                    <span className="rounded-full bg-primary/20 text-primary px-1.5 text-[10px]">
                      {pendingReceived.length + pendingSent.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setFriendsSubTab('discover')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    friendsSubTab === 'discover'
                      ? 'bg-surface text-primary border border-primary shadow-xs'
                      : 'text-muted hover:text-dark'
                  }`}
                >
                  Find Learners
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setFriendsSubTab('discover')}>
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Add Friend
                </Button>
              </div>
            </div>

            {/* Sub-tab: NETWORK (All Friends) */}
            {friendsSubTab === 'network' && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter friends by name or topic..."
                    className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary text-dark"
                  />
                </div>

                <div className="grid gap-3">
                  {filteredFriends.map((friend: any) => (
                    <Card key={friend.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:border-primary/40 transition-colors">
                      <div className="flex items-center gap-3.5">
                        <Avatar fallback={friend.name?.substring(0, 2).toUpperCase()} src={friend.avatar} size="lg" />
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-dark text-sm md:text-base">{friend.name}</h4>
                            <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                              Study Partner
                            </span>
                          </div>
                          <p className="text-xs text-muted mt-0.5">Focus: {friend.subject || 'Computer Science'}</p>
                          <p className="text-[11px] text-muted mt-0.5">{friend.mastery}% overall mastery</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-5">
                        <div className="text-center">
                          <p className="text-[10px] font-semibold uppercase text-muted mb-0.5">Streak</p>
                          <p className="flex items-center justify-center gap-1 font-bold text-orange-500 text-sm">
                            <Flame className="h-4 w-4" />{friend.streak || 0}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => startBattle(friend.name)}>
                            <Swords className="mr-1.5 h-3.5 w-3.5" /> Challenge
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFriend(friend.id, friend.name)}
                            className="p-2 rounded-lg text-muted hover:text-danger hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Remove friend"
                          >
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}

                  {filteredFriends.length === 0 && (
                    <Card className="p-8 text-center text-muted">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-medium text-dark">No study partners match your filter</p>
                      <p className="text-xs text-muted mt-1">Try another search term or discover new learners.</p>
                      <Button size="sm" variant="secondary" className="mt-3" onClick={() => setFriendsSubTab('discover')}>
                        Discover Learners
                      </Button>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab: PENDING REQUESTS */}
            {friendsSubTab === 'pending' && (
              <div className="space-y-6">
                {/* Received Requests */}
                <div>
                  <h4 className="text-sm font-bold text-dark mb-3 flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-primary" />
                    Incoming Requests ({pendingReceived.length})
                  </h4>
                  {pendingReceived.length === 0 ? (
                    <Card className="p-6 text-center text-muted text-xs">
                      No incoming friend requests right now.
                    </Card>
                  ) : (
                    <div className="grid gap-3">
                      {pendingReceived.map((req) => (
                        <Card key={req.id} className="p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Avatar fallback={req.sender?.name?.substring(0, 2).toUpperCase() || 'SP'} src={req.sender?.avatar} size="md" />
                            <div>
                              <h5 className="font-bold text-dark text-sm">{req.sender?.name || 'Fellow Learner'}</h5>
                              <p className="text-xs text-muted">{req.sender?.email || 'Wants to study together'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => handleAcceptRequest(req)}>
                              <Check className="h-3.5 w-3.5 mr-1" /> Accept
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => handleDeclineRequest(req.id)}>
                              <X className="h-3.5 w-3.5 mr-1" /> Decline
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sent Requests */}
                <div>
                  <h4 className="text-sm font-bold text-dark mb-3 flex items-center gap-2">
                    <Send className="h-4 w-4 text-muted" />
                    Sent Requests ({pendingSent.length})
                  </h4>
                  {pendingSent.length === 0 ? (
                    <Card className="p-6 text-center text-muted text-xs">
                      You haven't sent any pending requests.
                    </Card>
                  ) : (
                    <div className="grid gap-3">
                      {pendingSent.map((req) => (
                        <Card key={req.id} className="p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Avatar fallback={req.receiver?.name?.substring(0, 2).toUpperCase() || 'SP'} src={req.receiver?.avatar} size="md" />
                            <div>
                              <h5 className="font-bold text-dark text-sm">{req.receiver?.name || 'Study Partner'}</h5>
                              <p className="text-xs text-muted">Invitation pending response</p>
                            </div>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => handleCancelRequest(req.id)}>
                            Cancel Request
                          </Button>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab: DISCOVER LEARNERS */}
            {friendsSubTab === 'discover' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-dark mb-1">Discover Study Partners</h4>
                  <p className="text-xs text-muted">Search for other MindMate learners by name to study together.</p>
                </div>

                <div className="relative">
                  <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by learner name..."
                    className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary text-dark"
                  />
                  {isSearching && (
                    <RefreshCw className="absolute right-3.5 top-3.5 h-4 w-4 text-primary animate-spin" />
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="grid gap-3">
                    <p className="text-xs font-semibold text-muted">Search Results:</p>
                    {searchResults.map((peer) => {
                      const isPending = pendingSent.some(r => r.receiver_id === peer.id);
                      return (
                        <Card key={peer.id} className="p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Avatar fallback={peer.name?.substring(0, 2).toUpperCase()} src={peer.avatar} size="md" />
                            <div>
                              <h5 className="font-bold text-dark text-sm">{peer.name}</h5>
                              <p className="text-xs text-muted">{peer.email || 'MindMate Learner'}</p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleSendRequest(peer)}
                          >
                            {isPending ? 'Request Pending' : (
                              <>
                                <UserPlus className="h-3.5 w-3.5 mr-1" /> Add Friend
                              </>
                            )}
                          </Button>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Suggested Study Partners */}
                <div className="pt-2">
                  <p className="text-xs font-semibold text-muted mb-3">Suggested Study Partners:</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sampleFriends.map((peer: any) => (
                      <Card key={peer.id} className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar fallback={peer.avatar} size="md" />
                          <div className="min-w-0">
                            <h5 className="font-bold text-dark text-sm truncate">{peer.name}</h5>
                            <p className="text-xs text-muted truncate">Studying {peer.subject}</p>
                            <p className="text-[10px] text-muted">{peer.mastery}% mastery · {peer.streak}d streak</p>
                          </div>
                        </div>
                        <Button size="sm" onClick={() => startBattle(peer.name)}>
                          <Swords className="h-3.5 w-3.5 mr-1" /> Duel
                        </Button>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ADAPTIVE BATTLE */}
        {tab === 'battle' && (
          <div className="space-y-4">
            {!battleFriend && (
              <Card className="p-6">
                <h3 className="mb-2 text-lg font-bold text-dark">Choose a study partner for duel</h3>
                <p className="mb-4 text-sm text-muted">
                  MindMate adapts question difficulty to challenge both learners fairly.
                </p>
                <div className="flex flex-wrap gap-2">
                  {friends.map((f: any) => (
                    <Button key={f.id} variant="secondary" onClick={() => startBattle(f.name)}>
                      {f.name}
                    </Button>
                  ))}
                </div>
              </Card>
            )}

            {battleFriend && !battleFinished && currentQuestion && (
              <Card className="p-5 md:p-7 border-border">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-primary uppercase tracking-wider">ADAPTIVE PRACTICE DUEL</p>
                    <h3 className="text-xl font-bold text-dark">You vs {battleFriend}</h3>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-primary border border-border">
                    <Clock3 className="mr-1.5 inline h-3.5 w-3.5" />Question {battleIndex + 1} of {questions.length}
                  </span>
                </div>

                <div className="mb-5 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${((battleIndex + 1) / questions.length) * 100}%` }}
                  />
                </div>

                <h4 className="mb-4 text-base md:text-lg font-bold text-dark">{currentQuestion.question}</h4>

                <div className="grid gap-3 sm:grid-cols-2">
                  {currentQuestion.options.map((option, index) => (
                    <button
                      key={option}
                      onClick={() => setSelected(index)}
                      className={`rounded-xl border p-4 text-left text-sm font-medium transition ${
                        selected === index
                          ? 'border-primary bg-indigo-50/60 dark:bg-indigo-950/50 text-primary font-semibold ring-1 ring-primary'
                          : 'border-border bg-surface text-dark hover:border-primary/50'
                      }`}
                    >
                      <span className="font-bold mr-2">{String.fromCharCode(65 + index)}.</span>
                      {option}
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap justify-between gap-3 pt-4 border-t border-border">
                  <Button variant="secondary" onClick={() => { setBattleFriend(null); setBattleFinished(false); }}>
                    Exit Duel
                  </Button>
                  <Button onClick={submitAnswer}>
                    {battleIndex === questions.length - 1 ? 'Finish Battle' : 'Submit & Next'}
                  </Button>
                </div>
              </Card>
            )}

            {battleFriend && battleFinished && (
              <Card className="p-6 md:p-8 border-border">
                <div className="mb-5 text-center">
                  <div className="mx-auto mb-3 inline-flex rounded-2xl bg-amber-50 dark:bg-amber-950/40 p-4 text-amber-500 border border-amber-200 dark:border-amber-800/40">
                    <Trophy className="h-9 w-9" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-dark">
                    {result === 'Won' ? '🎉 You won the battle!' : result === 'Tie' ? '🤝 It’s a tie!' : '💪 Great practice — keep improving!'}
                  </h3>
                  <p className="mt-1 text-sm text-muted">Your battle results against {battleFriend}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-surface border border-border p-5 text-center">
                    <p className="text-xs font-semibold text-muted uppercase">Your Score</p>
                    <p className="my-1 text-4xl font-extrabold text-primary">{userScore}/{questions.length}</p>
                    <p className="font-bold text-xs text-primary">+{xpEarned} Learning XP earned</p>
                  </div>
                  <div className="rounded-2xl bg-surface border border-border p-5 text-center">
                    <p className="text-xs font-semibold text-muted uppercase">{battleFriend}'s Score</p>
                    <p className="my-1 text-4xl font-extrabold text-dark">{opponentScore}/{questions.length}</p>
                    <p className="text-xs text-muted">Adaptive peer score benchmark</p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/70 dark:bg-emerald-950/30 p-4">
                  <h4 className="font-bold text-emerald-800 dark:text-emerald-300 text-sm mb-3">
                    <BookOpen className="mr-2 inline h-4 w-4" />Review Key Concepts
                  </h4>
                  <div className="space-y-3">
                    {questions.map((q, i) => (
                      <div key={q.question} className="text-xs">
                        <p className="font-semibold text-dark">
                          {i + 1}. {q.question} {answers[i] === q.correct ? '✓' : '✗'}
                        </p>
                        <p className="text-muted mt-0.5">{q.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button onClick={() => startBattle(battleFriend)}>Play Again</Button>
                  <Button variant="secondary" onClick={() => { setBattleFriend(null); setBattleFinished(false); setTab('friends'); }}>
                    Back to Network
                  </Button>
                  <Button variant="secondary" onClick={() => setTab('rewards')}>View XP & Badges</Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* TAB 3: XP & REWARDS */}
        {tab === 'rewards' && (
          <div className="space-y-5">
            <Card className="p-6 border-border">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 p-4 text-amber-500 border border-amber-200 dark:border-amber-800/40">
                  <Trophy className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted uppercase">YOUR LEARNING XP</p>
                  <h3 className="text-3xl font-extrabold text-dark">{saved.xp} XP</h3>
                  <p className="text-xs text-muted mt-0.5">
                    {saved.xp >= 500 ? 'Scholar Rank' : saved.xp >= 200 ? 'Explorer Rank' : 'Novice Rank'} · Level up through daily quizzes & battles
                  </p>
                </div>
              </div>
              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (saved.xp % 200) / 2)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">{200 - (saved.xp % 200)} XP until next badge milestone</p>
            </Card>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { title: 'Quick Learner', desc: 'Complete a study battle', icon: BookOpen, unlocked: (saved.history?.length || 0) >= 1 },
                { title: 'Quiz Champion', desc: 'Defeat peer in a duel', icon: Trophy, unlocked: (saved.history || []).some((h: BattleHistory) => h.result === 'Won') },
                { title: 'Consistent Student', desc: 'Participate in 5 duels', icon: Flame, unlocked: (saved.history?.length || 0) >= 5 },
              ].map((b) => (
                <Card
                  key={b.title}
                  className={`p-5 transition-all ${
                    b.unlocked
                      ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20'
                      : 'opacity-70 border-border'
                  }`}
                >
                  <b.icon className={`mb-3 h-7 w-7 ${b.unlocked ? 'text-amber-500' : 'text-muted'}`} />
                  <h4 className="font-bold text-dark text-sm">{b.title}</h4>
                  <p className="mt-1 text-xs text-muted">{b.desc}</p>
                  <p className={`mt-3 text-[11px] font-bold ${b.unlocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}`}>
                    {b.unlocked ? '✓ Unlocked' : '🔒 Locked'}
                  </p>
                </Card>
              ))}
            </div>

            <Card className="p-5 border-border">
              <h3 className="mb-4 font-bold text-dark text-sm">Recent Match History</h3>
              {!saved.history || saved.history.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">No battles yet. Challenge a study partner to earn XP!</p>
              ) : (
                <div className="space-y-3">
                  {saved.history.map((h: BattleHistory) => (
                    <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
                      <div>
                        <p className="font-semibold text-dark text-sm">vs {h.friend} · {h.result}</p>
                        <p className="text-xs text-muted">{h.date} · You {h.yours}/{questions.length}, opponent {h.theirs}/{questions.length}</p>
                      </div>
                      <span className="font-bold text-primary text-sm">+{h.xp} XP</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 4: INVITE FRIENDS */}
        {tab === 'invite' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5 md:p-6 border-border">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-xl bg-surface p-3 text-primary border border-border">
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-dark text-sm md:text-base">Invite via Email</h3>
                  <p className="text-xs text-muted">Prepare a personal invitation link.</p>
                </div>
              </div>
              <label className="mb-1 block text-xs font-semibold text-dark uppercase tracking-wider">Friend’s Name</label>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Alex Smith"
                className="mb-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary text-dark"
              />
              <label className="mb-1 block text-xs font-semibold text-dark uppercase tracking-wider">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="friend@example.com"
                className="mb-4 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary text-dark"
              />
              <Button className="w-full" onClick={sendEmailInvite}>
                <Mail className="mr-2 h-4 w-4" /> Send Email Invitation
              </Button>
            </Card>

            <Card className="p-5 md:p-6 border-border">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-xl bg-surface p-3 text-emerald-500 border border-border">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-dark text-sm md:text-base">Invite via WhatsApp</h3>
                  <p className="text-xs text-muted">Share invite directly to your study group.</p>
                </div>
              </div>
              <label className="mb-1 block text-xs font-semibold text-dark uppercase tracking-wider">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Country code + number (e.g. 15551234567)"
                className="mb-4 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary text-dark"
              />
              <Button className="w-full" onClick={sendWhatsAppInvite}>
                <MessageCircle className="mr-2 h-4 w-4" /> Open WhatsApp Share
              </Button>
            </Card>

            <Card className="p-5 md:col-span-2 border-border">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <h3 className="font-bold text-dark text-sm md:text-base flex items-center gap-2">
                    <Gift className="h-5 w-5 text-primary" /> Your Referral Link
                  </h3>
                  <p className="mt-1 text-xs text-muted">Share this direct link so peers sign up linked to your network.</p>
                  <p className="mt-2.5 break-all rounded-xl bg-gray-100 dark:bg-slate-800 p-3 font-mono text-xs text-dark border border-border">
                    {`${window.location.origin}/register?ref=${referralCode}`}
                  </p>
                  <p className="mt-2 text-xs text-muted">Your code: <strong className="text-dark font-mono">{referralCode}</strong></p>
                </div>
                <Button onClick={copyReferral}>
                  {copied ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy Link'}
                </Button>
              </div>
            </Card>
          </div>
        )}

      </div>
    </AppShell>
  );
}
