import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { useEffect, useState } from 'react';
import { TelegramWebAppUser } from './telegram';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signIn = () => signInWithPopup(auth, googleProvider);
export const signOut = () => auth.signOut();

export const signInWithTelegramCustomToken = (token: string) => signInWithCustomToken(auth, token);

export async function linkTelegramToCurrentUser(telegramUser: TelegramWebAppUser) {
  if (!auth.currentUser) return;

  const userRef = doc(db, "users", auth.currentUser.uid);
  const nowIso = new Date().toISOString();
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    await setDoc(userRef, {
      telegramId: String(telegramUser.id),
      updatedAt: nowIso,
    }, { merge: true });
    return;
  }

  await setDoc(userRef, {
    id: auth.currentUser.uid,
    displayName: auth.currentUser.displayName || telegramUser.username || telegramUser.first_name || "Герой",
    xp: 0,
    level: 1,
    streakCount: 0,
    createdAt: nowIso,
    telegramId: String(telegramUser.id),
    settings: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      notificationsEnabled: true,
      notifyBeforeDeadline: 30,
      theme: "light",
      badgeStyle: "none",
      profileStyle: "default",
      premiumCosmeticsUnlocked: false,
      subscriptionPlan: "free",
    },
    updatedAt: nowIso,
  });
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}

// Validation check as requested by Firebase skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
