import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response } from "express";

export type ParkingRole = "driver" | "operator";

export type ParkingIdentity = {
  userId: string;
  email: string;
  displayName: string;
  role: ParkingRole;
};

type CachedClerkProfile = {
  email: string;
  displayName: string;
  verified: boolean;
  expiresAt: number;
};

const profileCache = new Map<string, CachedClerkProfile>();
const PROFILE_CACHE_TTL_MS = 60_000;
const MAX_CACHED_PROFILES = 1000;

function allowedOperatorEmails() {
  return new Set(
    (process.env.PARKING_OPERATOR_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
}

async function getClerkProfile(userId: string): Promise<CachedClerkProfile> {
  const cached = profileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const user = await clerkClient.users.getUser(userId);
  const primaryEmail = user.primaryEmailAddress;
  const email = primaryEmail?.emailAddress.trim().toLocaleLowerCase() ?? "";
  if (!email) {
    throw new Error("The signed-in Clerk user has no primary email address.");
  }

  const profile: CachedClerkProfile = {
    email,
    displayName:
      user.fullName?.trim() ||
      user.username?.trim() ||
      user.firstName?.trim() ||
      email.split("@")[0],
    verified: primaryEmail?.verification?.status === "verified",
    expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
  };

  if (profileCache.size >= MAX_CACHED_PROFILES) {
    const firstKey = profileCache.keys().next().value;
    if (firstKey) profileCache.delete(firstKey);
  }
  profileCache.set(userId, profile);
  return profile;
}

export async function getParkingIdentity(
  req: Request,
  res: Response,
): Promise<ParkingIdentity | null> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return null;
  }

  try {
    const profile = await getClerkProfile(userId);
    if (!profile.verified) {
      res.status(403).json({ error: "Verify your email address to continue." });
      return null;
    }
    const isOperator = allowedOperatorEmails().has(profile.email);
    return {
      userId,
      email: profile.email,
      displayName: profile.displayName,
      role: isOperator ? "operator" : "driver",
    };
  } catch (error) {
    console.error("Could not resolve the signed-in parking user.", error);
    res.status(503).json({
      error: "Your account could not be verified right now. Please retry.",
    });
    return null;
  }
}

export async function getOperatorIdentity(
  req: Request,
  res: Response,
): Promise<ParkingIdentity | null> {
  const identity = await getParkingIdentity(req, res);
  if (!identity) return null;
  if (identity.role !== "operator") {
    res.status(403).json({ error: "Parking operator access is required." });
    return null;
  }
  return identity;
}
