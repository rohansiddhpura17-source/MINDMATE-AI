import React from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { friends } from '../data/mockData';
import { Flame, Swords, Plus } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export default function Friends() {
  const { showToast } = useAppContext();

  const handleChallenge = (name: string) => {
    showToast(`Challenge sent to ${name}! They have 24 hours to accept.`, 'success');
  };

  return (
    <AppShell pageTitle="Learn Together" pageSubtitle="Collaborate and compete with peers">
      <div className="max-w-4xl space-y-8">
        
        <Card className="p-8 bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="p-4 bg-white rounded-2xl shadow-sm inline-block">
              <Swords className="h-10 w-10 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-dark mb-2">Adaptive Battles</h2>
              <p className="text-dark/80 max-w-xl">
                Challenge your friends to a 5-minute Adaptive Battle. MindMate will generate questions tailored to find the perfect middle ground between both of your mastery levels.
              </p>
            </div>
          </div>
        </Card>

        <div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold">Your Network</h3>
            <Button variant="secondary" size="sm">
              <Plus className="h-4 w-4 mr-2" /> Add Friend
            </Button>
          </div>
          
          <div className="grid gap-4">
            {friends.map((friend) => (
              <Card key={friend.id} className="p-4 flex items-center justify-between hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-4">
                  <Avatar fallback={friend.avatar} size="lg" />
                  <div>
                    <h4 className="font-bold text-dark">{friend.name}</h4>
                    <p className="text-sm text-muted">Studying {friend.subject}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="hidden sm:block text-center">
                    <p className="text-xs text-muted font-semibold uppercase mb-1">Streak</p>
                    <div className="flex items-center justify-center gap-1 text-orange-500 font-bold">
                      <Flame className="h-4 w-4" /> {friend.streak}
                    </div>
                  </div>
                  <div className="hidden sm:block text-center">
                    <p className="text-xs text-muted font-semibold uppercase mb-1">Mastery</p>
                    <p className="font-bold text-dark">{friend.mastery}%</p>
                  </div>
                  
                  <Button onClick={() => handleChallenge(friend.name)}>
                    Challenge
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>

      </div>
    </AppShell>
  );
}
