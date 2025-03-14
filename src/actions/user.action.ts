"use server";

import { prisma } from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export async function syncUser() {
    try {
        const { userId } = await auth();
        const user = await currentUser();

        if (!user || !userId) return;

        // For existing users
        const existingUser = await prisma.users.findUnique({
            where: {
                clerkId: userId,
            },
        });

        if (existingUser) return existingUser;

        const dbUser = await prisma.users.create({
            data: {
                clerkId: userId,
                name: `${user.firstName} ${user.lastName}`,
                username: user.username ?? user.emailAddresses[0].emailAddress.split('@')[0],
                email: user.emailAddresses[0].emailAddress,
                image: user.imageUrl,
            },
        });

    } catch (error) {
        console.log(error);
    }
} // Database is now synced with Clerk

export async function getUserByClerkId(clerkId: string) {
    return await prisma.users.findUnique({
        where: {
            clerkId,
        },
        include: {
            _count: { // Count the number of followers, following, and posts
                select: {
                    followers: true,
                    following: true,
                    posts: true,
                },
            },
        },
    });
}

export async function getDbUserId() {
    const { userId: clerkId } = await auth();
    if (!clerkId) return null;

    const user = await getUserByClerkId(clerkId);
    if (!user) throw new Error('User not found');

    return user.id;
}

export async function getRandomUsers() {
    try {
        const userId = await getDbUserId();
        if(!userId) return;
        // get 3 random users excluding the current user and users the current user is following
        const randomUser = await prisma.users.findMany({
            where: {
                AND: [
                    { NOT: { id: userId } },
                    {
                        NOT: {
                            followers: {
                                some: {
                                    followerId: userId
                                }
                            }
                        }
                    }

                ]
            },
            select: {
                id: true,
                name: true,
                username: true,
                image: true,
                _count: {
                    select: {
                        followers: true,
                    },
                },
            },
            take: 3,
        });
        return randomUser;

    } catch (error) {
        console.log(error);
    }
}

export async function toggleFollow(targetUserId: string) {
    try {
        const userId = await getDbUserId();
        if (!userId) return;
        if (userId === targetUserId) throw new Error('You cannot follow yourself');

        const existingFollow = await prisma.follows.findUnique({
            where: {
                followerId_followingId: {
                    followerId: userId,
                    followingId: targetUserId,
                },
            },
        });

        if (existingFollow) {
            // unfollow
            await prisma.follows.delete({
                where: {
                    followerId_followingId: {
                        followerId: userId,
                        followingId: targetUserId,
                    },
                },
            });
        }
        else {
            // all or nothing
            // basically a transaction ki tarah hai ya toh dono honge ya koi bhi nahi hoga (notification and follow)
            await prisma.$transaction([
                prisma.follows.create({
                    data: {
                        followerId: userId,
                        followingId: targetUserId,
                    },
                }),
                prisma.notification.create({
                    data: {
                        type:"FOLLOW",
                        userId: targetUserId, // user who is being followed
                        creatorId: userId, // user who is following
                    },
                }),
            ]);
        }
        revalidatePath("/");
        return { success: true };

    } catch (error) {
        console.log(error);
        return { success: false };
    }
}