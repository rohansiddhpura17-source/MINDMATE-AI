import { prisma } from '../db.js';
import { checkAndUnlockAchievement } from './challenge.js';

export interface SafeUserProfile {
  id: string;
  name: string;
  role: string;
  goal: string | null;
  friendshipStatus?: 'NONE' | 'FRIENDS' | 'REQUEST_SENT' | 'REQUEST_RECEIVED';
  friendshipId?: string;
}

export interface FriendItem {
  id: string;
  friendshipId: string;
  userId: string;
  name: string;
  role: string;
  goal: string | null;
  since: string;
}

export interface FriendRequestItem {
  friendshipId: string;
  user: {
    id: string;
    name: string;
    role: string;
    goal: string | null;
  };
  createdAt: string;
}

export interface FriendshipOverview {
  friends: FriendItem[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
}

/**
 * Searches users safely without exposing private email addresses or unrelated sensitive data.
 */
export async function searchUsers(currentUserId: string, query: string): Promise<SafeUserProfile[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return [];
  }

  // Find users whose name or email starts with or contains query (limit 15)
  const users = await prisma.user.findMany({
    where: {
      id: { not: currentUserId },
      OR: [
        { name: { contains: trimmed } },
        { email: { contains: trimmed } },
      ],
    },
    select: {
      id: true,
      name: true,
      role: true,
      goal: true,
    },
    take: 15,
  });

  if (users.length === 0) return [];

  // Fetch all existing friendships involving current user and these candidates
  const candidateIds = users.map(u => u.id);
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: currentUserId, addresseeId: { in: candidateIds } },
        { requesterId: { in: candidateIds }, addresseeId: currentUserId },
      ],
    },
  });

  const friendshipMap = new Map<string, { id: string; status: string; requesterId: string; addresseeId: string }>();
  for (const f of friendships) {
    const otherId = f.requesterId === currentUserId ? f.addresseeId : f.requesterId;
    friendshipMap.set(otherId, f);
  }

  return users.map(user => {
    const f = friendshipMap.get(user.id);
    let friendshipStatus: SafeUserProfile['friendshipStatus'] = 'NONE';
    let friendshipId: string | undefined = undefined;

    if (f) {
      friendshipId = f.id;
      if (f.status === 'ACCEPTED') {
        friendshipStatus = 'FRIENDS';
      } else if (f.status === 'PENDING') {
        friendshipStatus = f.requesterId === currentUserId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED';
      }
    }

    return {
      id: user.id,
      name: user.name,
      role: user.role,
      goal: user.goal,
      friendshipStatus,
      friendshipId,
    };
  });
}

/**
 * Sends a friend request to target user.
 */
export async function sendFriendRequest(currentUserId: string, addresseeId: string) {
  if (currentUserId === addresseeId) {
    throw new Error('Cannot send friend request to yourself');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: addresseeId },
    select: { id: true, name: true },
  });

  if (!targetUser) {
    throw new Error('User not found');
  }

  // Check if existing friendship exists in either direction
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: currentUserId, addresseeId },
        { requesterId: addresseeId, addresseeId: currentUserId },
      ],
    },
  });

  if (existing) {
    if (existing.status === 'ACCEPTED') {
      throw new Error('You are already friends with this user');
    }
    if (existing.status === 'PENDING') {
      if (existing.requesterId === currentUserId) {
        throw new Error('Friend request already sent');
      } else {
        // Auto-accept if they had already sent one to you
        return acceptFriendRequest(currentUserId, existing.id);
      }
    }
    // If declined or other, update to pending
    const updated = await prisma.friendship.update({
      where: { id: existing.id },
      data: {
        requesterId: currentUserId,
        addresseeId,
        status: 'PENDING',
      },
    });
    return updated;
  }

  const created = await prisma.friendship.create({
    data: {
      requesterId: currentUserId,
      addresseeId,
      status: 'PENDING',
    },
  });

  return created;
}

/**
 * Accepts a pending incoming friend request.
 */
export async function acceptFriendRequest(currentUserId: string, friendshipId: string) {
  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    throw new Error('Friend request not found');
  }

  if (friendship.addresseeId !== currentUserId) {
    throw new Error('Unauthorized: only the recipient can accept this friend request');
  }

  if (friendship.status === 'ACCEPTED') {
    return friendship;
  }

  const updated = await prisma.friendship.update({
    where: { id: friendshipId },
    data: {
      status: 'ACCEPTED',
    },
  });

  // Award FIRST_FRIEND achievement to both users
  await checkAndUnlockAchievement(friendship.requesterId, 'FIRST_FRIEND');
  await checkAndUnlockAchievement(currentUserId, 'FIRST_FRIEND');

  return updated;
}

/**
 * Declines a pending friend request.
 */
export async function declineFriendRequest(currentUserId: string, friendshipId: string) {
  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    throw new Error('Friend request not found');
  }

  if (friendship.addresseeId !== currentUserId) {
    throw new Error('Unauthorized: only the recipient can decline this friend request');
  }

  const updated = await prisma.friendship.update({
    where: { id: friendshipId },
    data: {
      status: 'DECLINED',
    },
  });

  return updated;
}

/**
 * Cancels a sent pending friend request.
 */
export async function cancelFriendRequest(currentUserId: string, friendshipId: string) {
  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    throw new Error('Friend request not found');
  }

  if (friendship.requesterId !== currentUserId) {
    throw new Error('Unauthorized: only the sender can cancel this friend request');
  }

  await prisma.friendship.delete({
    where: { id: friendshipId },
  });

  return { success: true, message: 'Friend request cancelled' };
}

/**
 * Removes an existing friend.
 */
export async function removeFriend(currentUserId: string, friendshipId: string) {
  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    throw new Error('Friendship not found');
  }

  if (friendship.requesterId !== currentUserId && friendship.addresseeId !== currentUserId) {
    throw new Error('Unauthorized: you are not part of this friendship');
  }

  await prisma.friendship.delete({
    where: { id: friendshipId },
  });

  return { success: true, message: 'Friend removed' };
}

/**
 * Retrieves the user's friends list and pending requests.
 */
export async function getFriendshipOverview(currentUserId: string): Promise<FriendshipOverview> {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: currentUserId },
        { addresseeId: currentUserId },
      ],
    },
    include: {
      requester: {
        select: { id: true, name: true, role: true, goal: true },
      },
      addressee: {
        select: { id: true, name: true, role: true, goal: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const friends: FriendItem[] = [];
  const incomingRequests: FriendRequestItem[] = [];
  const outgoingRequests: FriendRequestItem[] = [];

  for (const f of friendships) {
    if (f.status === 'ACCEPTED') {
      const other = f.requesterId === currentUserId ? f.addressee : f.requester;
      friends.push({
        id: f.id,
        friendshipId: f.id,
        userId: other.id,
        name: other.name,
        role: other.role,
        goal: other.goal,
        since: f.updatedAt.toISOString(),
      });
    } else if (f.status === 'PENDING') {
      if (f.addresseeId === currentUserId) {
        incomingRequests.push({
          friendshipId: f.id,
          user: f.requester,
          createdAt: f.createdAt.toISOString(),
        });
      } else if (f.requesterId === currentUserId) {
        outgoingRequests.push({
          friendshipId: f.id,
          user: f.addressee,
          createdAt: f.createdAt.toISOString(),
        });
      }
    }
  }

  return {
    friends,
    incomingRequests,
    outgoingRequests,
  };
}
