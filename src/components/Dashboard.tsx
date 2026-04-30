import { useEffect, useState, useRef } from "react";
import { UserProfile, Quest, calculateLevel, xpForNextLevel, QuestStatus, QuestType, ThemeMode, BadgeStyle, ProfileStyle } from "@/types";
import { db, auth, signInWithTelegramCustomToken } from "@/lib/firebase";
import { collection, doc, getDoc, query, where, updateDoc, setDoc, onSnapshot, deleteDoc, deleteField } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  CheckCircle2, 
  Clock, 
  Trophy, 
  Settings, 
  User, 
  Bell, 
  Globe, 
  Award, 
  LayoutDashboard,
  Target,
  Repeat,
  Edit2,
  Flame,
  Trash2,
  Calendar as CalendarIcon
} from "lucide-react";
import CreateQuestDialog from "./CreateQuestDialog";
import EditQuestDialog from "./EditQuestDialog";
import XPProgressionChart from "./XPProgressionChart";
import CalendarView from "./CalendarView";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { handleFirestoreError, OperationType } from "@/lib/error-handler";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { addDoc } from "firebase/firestore";
import confetti from "canvas-confetti";
import { initTelegramWebApp } from "@/lib/telegram";

const COMPLETION_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3";
const SOUND_PACKS: Record<string, string> = {
  default: COMPLETION_SOUND_URL,
  mario: "https://www.myinstants.com/media/sounds/mario-coin.mp3",
  zelda: "https://www.myinstants.com/media/sounds/zelda-secret.mp3",
  gta: "https://www.myinstants.com/media/sounds/gta-san-andreas-mission-passed.mp3"
};

export default function Dashboard() {
  type ManualSubscriptionRequest = {
    id: string;
    telegramId: string;
    plan: "month" | "half_year" | "year";
    amountExpected: number;
    currency: string;
    durationDays: number;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
  };

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [xpHistory, setXpHistory] = useState<any[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Edit Quest State
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // Settings state
  const [editName, setEditName] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [editTelegramId, setEditTelegramId] = useState("");
  const [editNotifications, setEditNotifications] = useState(true);
  const [editTheme, setEditTheme] = useState<ThemeMode>("light");
  const [editBadgeStyle, setEditBadgeStyle] = useState<BadgeStyle>("none");
  const [editProfileStyle, setEditProfileStyle] = useState<ProfileStyle>("default");
  const [editSoundPack, setEditSoundPack] = useState<SoundPack>("default");
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [subscriptionPlanChoice, setSubscriptionPlanChoice] = useState<"month" | "half_year" | "year">("month");
  const [manualRequestLoading, setManualRequestLoading] = useState(false);
  const [pendingManualRequest, setPendingManualRequest] = useState<ManualSubscriptionRequest | null>(null);
  const [adminRequests, setAdminRequests] = useState<ManualSubscriptionRequest[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [showLostStreakModal, setShowLostStreakModal] = useState(false);
  const [showBenefitsModal, setShowBenefitsModal] = useState(false);
  const [activeTab, setActiveTab] = useState("quests");
  const audioRef = useRef<HTMLAudioElement | null>(null);


  const handleDismissLostStreak = async () => {
    if (!auth.currentUser || !profile) return;
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      "settings.pendingLostStreak": deleteField()
    });
    setProfile(prev => prev ? { ...prev, settings: { ...prev.settings, pendingLostStreak: undefined } } : null);
    setShowLostStreakModal(false);
  };

  const applyTheme = (theme: ThemeMode) => {
    document.documentElement.classList.remove("dark");
    document.documentElement.removeAttribute("data-theme");
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      return;
    }
    if (theme === "ocean") {
      document.documentElement.setAttribute("data-theme", "ocean");
    }
  };

  useEffect(() => {
    audioRef.current = new Audio(COMPLETION_SOUND_URL);
  }, []);

  const playSuccessSound = () => {
    const soundPack = profile?.settings?.soundPack || "default";
    const audio = new Audio(SOUND_PACKS[soundPack] || COMPLETION_SOUND_URL);
    audio.play().catch(e => console.log("Audio play failed:", e));
  };

  const triggerConfetti = () => {
    const end = Date.now() + 1 * 1000;
    const colors = ["#3b82f6", "#60a5fa", "#ffffff", "#fbbf24"];

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };

  const applyProfileData = async (raw: Partial<UserProfile>) => {
    if (!auth.currentUser) return;
    const docRef = doc(db, "users", auth.currentUser.uid);
    const normalizedProfile: UserProfile = {
      id: raw.id || auth.currentUser.uid,
      displayName: raw.displayName || auth.currentUser.displayName || "Герой",
      xp: typeof raw.xp === "number" ? raw.xp : 0,
      level: typeof raw.level === "number" ? raw.level : 1,
      streakCount: typeof raw.streakCount === "number" ? raw.streakCount : 0,
      lastStreakUpdate: raw.lastStreakUpdate,
      telegramId: raw.telegramId,
      settings: {
        timezone: raw.settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        notificationsEnabled: raw.settings?.notificationsEnabled ?? true,
        notifyBeforeDeadline: raw.settings?.notifyBeforeDeadline ?? 30,
        theme: raw.settings?.theme || "light",
        badgeStyle: raw.settings?.badgeStyle || "none",
        profileStyle: raw.settings?.profileStyle || "default",
        premiumCosmeticsUnlocked: raw.settings?.premiumCosmeticsUnlocked ?? false,
        subscriptionPlan: raw.settings?.subscriptionPlan || "free",
        subscriptionUntil: raw.settings?.subscriptionUntil,
        freezesUsedThisMonth: raw.settings?.freezesUsedThisMonth ?? 0,
        lastFreezeMonth: raw.settings?.lastFreezeMonth,
        pendingLostStreak: raw.settings?.pendingLostStreak,
        soundPack: raw.settings?.soundPack || "default",
      },
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt,
    };

    let updatedStreak = normalizedProfile.streakCount || 0;
    if (normalizedProfile.lastStreakUpdate) {
      const lastUpdate = new Date(normalizedProfile.lastStreakUpdate);
      const now = new Date();
      
      const isSameDay = (d1: Date, d2: Date) => 
        d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
      
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      const isPro = normalizedProfile.settings.subscriptionPlan === "pro" && 
                    normalizedProfile.settings.subscriptionUntil && 
                    new Date(normalizedProfile.settings.subscriptionUntil) > now;

      if (!isSameDay(lastUpdate, now) && !isSameDay(lastUpdate, yesterday)) {
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                      
        let freezesUsed = normalizedProfile.settings.lastFreezeMonth === currentMonthStr 
                          ? (normalizedProfile.settings.freezesUsedThisMonth || 0) 
                          : 0;

        if (isPro && freezesUsed < 5) {
           try {
             freezesUsed += 1;
             await updateDoc(docRef, {
               "settings.freezesUsedThisMonth": freezesUsed,
               "settings.lastFreezeMonth": currentMonthStr,
               lastStreakUpdate: now.toISOString(),
               updatedAt: now.toISOString()
             });
             normalizedProfile.settings.freezesUsedThisMonth = freezesUsed;
             normalizedProfile.settings.lastFreezeMonth = currentMonthStr;
             normalizedProfile.lastStreakUpdate = now.toISOString();
             toast.success(`Стрик спасен! Заморозок: ${freezesUsed}/5 в этом месяце. ❄️`);
           } catch (err) {
             console.error("[Streak] Freeze update failed:", err);
           }
        } else {
           const lostStreak = updatedStreak;
           updatedStreak = 0;
           normalizedProfile.streakCount = 0;
           normalizedProfile.lastStreakUpdate = now.toISOString(); // prevent re-trigger
           
           const updates: any = {
             streakCount: 0,
             lastStreakUpdate: now.toISOString(), // IMPORTANT: break the onSnapshot loop
             updatedAt: now.toISOString()
           };
           
           if (!isPro && lostStreak > 0) {
             updates["settings.pendingLostStreak"] = lostStreak;
             normalizedProfile.settings.pendingLostStreak = lostStreak;
           }
           
           await updateDoc(docRef, updates);
           
           if (!isPro && lostStreak > 0) {
             setShowLostStreakModal(true);
           }
        }
      }

      if (isPro && normalizedProfile.settings.pendingLostStreak) {
         updatedStreak = normalizedProfile.settings.pendingLostStreak;
         await updateDoc(docRef, {
           streakCount: updatedStreak,
           "settings.pendingLostStreak": deleteField()
         });
         normalizedProfile.streakCount = updatedStreak;
         delete normalizedProfile.settings.pendingLostStreak;
         toast.success("Ваш стрик был успешно восстановлен благодаря подписке Growly Pro!", { icon: "🔥" });
      }

      if (!isPro && normalizedProfile.settings.pendingLostStreak) {
         setShowLostStreakModal(true);
      }
    }

    setProfile({ ...normalizedProfile, streakCount: updatedStreak });
    setEditName(normalizedProfile.displayName);
    setEditTimezone(normalizedProfile.settings.timezone);
    setEditTelegramId(normalizedProfile.telegramId || "");
    setEditNotifications(normalizedProfile.settings.notificationsEnabled);
    const theme = (normalizedProfile.settings.theme || "light") as ThemeMode;
    setEditTheme(theme);
    setEditBadgeStyle((normalizedProfile.settings.badgeStyle || "none") as BadgeStyle);
    setEditProfileStyle((normalizedProfile.settings.profileStyle || "default") as ProfileStyle);
    setEditSoundPack((normalizedProfile.settings.soundPack || "default") as SoundPack);
    applyTheme(theme);
    setLoading(false);
  };

  const fetchProfile = async () => {
    if (!auth.currentUser) return;
    const docRef = doc(db, "users", auth.currentUser.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      await applyProfileData(docSnap.data() as Partial<UserProfile>);
    } else {
      const newProfile: UserProfile = {
        id: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || "Герой",
        xp: 0,
        level: 1,
        settings: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          notificationsEnabled: true,
          notifyBeforeDeadline: 30,
          theme: "light",
          badgeStyle: "none",
          profileStyle: "default",
          premiumCosmeticsUnlocked: false,
        },
        createdAt: new Date().toISOString(),
        streakCount: 0,
      };
      await setDoc(docRef, newProfile);
      await applyProfileData(newProfile);
    }
  };

  useEffect(() => {
    const cachedTheme = localStorage.getItem("growlyTheme") as ThemeMode | null;
    if (cachedTheme) {
      applyTheme(cachedTheme);
      setEditTheme(cachedTheme);
    }
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchProfile().catch((error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
      setLoading(false);
    });

    const userRef = doc(db, "users", auth.currentUser.uid);
    const unsubscribeUser = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Partial<UserProfile>;
        applyProfileData(data).catch(() => null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser.uid}`);
      setLoading(false);
    });

    const questsRef = collection(db, `users/${auth.currentUser.uid}/quests`);
    const historyRef = collection(db, `users/${auth.currentUser.uid}/xpHistory`);
    
    // Listen for all quests to calculate stats
    const unsubscribeQuests = onSnapshot(questsRef, (snapshot) => {
      const qList = snapshot.docs.map(doc => doc.data() as Quest);
      setQuests(qList.filter(q => q.status === QuestStatus.ACTIVE));
      setCompletedCount(qList.filter(q => q.status === QuestStatus.COMPLETED).length);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser.uid}/quests`);
      setLoading(false);
    });

    // Listen for XP history
    const unsubscribeHistory = onSnapshot(historyRef, (snapshot) => {
      setXpHistory(snapshot.docs.map(doc => doc.data()));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser.uid}/xpHistory`);
      setLoading(false);
    });

    return () => {
      unsubscribeUser();
      unsubscribeQuests();
      unsubscribeHistory();
    };
  }, [auth.currentUser]);

  const completeQuest = async (quest: Quest) => {
    if (!auth.currentUser || !profile) return;

    try {
      const questRef = doc(db, `users/${auth.currentUser.uid}/quests`, quest.id);
      await updateDoc(questRef, {
        status: QuestStatus.COMPLETED,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const newXp = profile.xp + quest.xpReward;
      const newLevel = calculateLevel(newXp);
      
      // Streak Logic
      const now = new Date();
      const lastUpdate = profile.lastStreakUpdate ? new Date(profile.lastStreakUpdate) : null;
      let newStreak = profile.streakCount || 0;

      const isSameDay = (d1: Date, d2: Date) => 
        d1.getFullYear() === d2.getFullYear() && 
        d1.getMonth() === d2.getMonth() && 
        d1.getDate() === d2.getDate();

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (!lastUpdate) {
        newStreak = 1;
      } else if (isSameDay(lastUpdate, now)) {
        // Same day: only start streak if it's 0 (fresh start after reset)
        if (newStreak === 0) newStreak = 1;
        // else: already did something today, streak stays same
      } else if (isSameDay(lastUpdate, yesterday)) {
        // Continued streak from yesterday
        newStreak += 1;
      } else {
        // Missed 2+ days
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const isPro = profile.settings.subscriptionPlan === "pro" && 
                      profile.settings.subscriptionUntil && 
                      new Date(profile.settings.subscriptionUntil) > now;
        let freezesUsed = profile.settings.lastFreezeMonth === currentMonthStr 
                          ? (profile.settings.freezesUsedThisMonth || 0) 
                          : 0;
                          
        if (isPro && freezesUsed < 5) {
           freezesUsed += 1;
           newStreak += 1;
           await updateDoc(doc(db, "users", auth.currentUser.uid), {
              "settings.freezesUsedThisMonth": freezesUsed,
              "settings.lastFreezeMonth": currentMonthStr
           });
           toast.success(`Стрик спасен! Заморозок: ${freezesUsed}/5 в этом месяце.`, { icon: "❄️" });
           setProfile(prev => prev ? { 
              ...prev, 
              settings: { ...prev.settings, freezesUsedThisMonth: freezesUsed, lastFreezeMonth: currentMonthStr } 
           } : null);
        } else {
           const savedStreak = profile.streakCount;
           newStreak = 1;
           if (!isPro && savedStreak > 0) {
              await updateDoc(doc(db, "users", auth.currentUser.uid), { 
                 "settings.pendingLostStreak": savedStreak
              });
              setProfile(prev => prev ? { 
                 ...prev, 
                 settings: { ...prev.settings, pendingLostStreak: savedStreak } 
              } : null);
              setTimeout(() => setShowLostStreakModal(true), 500);
           }
        }
      }

      const userRef = doc(db, "users", auth.currentUser.uid);
      
      await updateDoc(userRef, {
        xp: newXp,
        level: newLevel,
        streakCount: newStreak,
        lastStreakUpdate: now.toISOString(),
        updatedAt: now.toISOString()
      });

      // Record XP History
      const historyRef = collection(db, `users/${auth.currentUser.uid}/xpHistory`);
      await addDoc(historyRef, {
        userId: auth.currentUser.uid,
        xpGained: quest.xpReward,
        timestamp: now.toISOString(),
        questTitle: quest.title
      });

      playSuccessSound();
      triggerConfetti();

      if (newLevel > profile.level) {
        toast.success(`УРОВЕНЬ ПОВЫШЕН! Теперь вы ${newLevel} уровня!`, {
          icon: <Trophy className="w-5 h-5 text-yellow-500" />
        });
      } else if (newStreak > (profile.streakCount || 0)) {
        toast.success(`СТРИК! Вы в огне уже ${newStreak} дн.!`, {
          icon: <Flame className="w-5 h-5 text-orange-500" fill="currentColor" />
        });
      } else {
        toast.success(`Квест выполнен! +${quest.xpReward} XP`);
      }

      setProfile(prev => prev ? { ...prev, xp: newXp, level: newLevel, streakCount: newStreak, lastStreakUpdate: now.toISOString() } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}/quests/${quest.id}`);
    }
  };

  const saveSettings = async () => {
    if (!auth.currentUser || !profile) return;
    try {
      const safeBadgeStyle: BadgeStyle =
        !premiumCosmeticsUnlocked && (editBadgeStyle === "gold" || editBadgeStyle === "crown")
          ? "silver"
          : editBadgeStyle;
      const safeProfileStyle: ProfileStyle =
        !premiumCosmeticsUnlocked && ["neon", "cyberpunk", "midnight", "sunset"].includes(editProfileStyle)
          ? "glass"
          : editProfileStyle;

      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, {
        displayName: editName,
        telegramId: editTelegramId.trim() || null,
        settings: {
          ...profile.settings,
          timezone: editTimezone,
          notificationsEnabled: editNotifications,
          theme: editTheme,
          badgeStyle: safeBadgeStyle,
          profileStyle: safeProfileStyle,
          soundPack: editSoundPack,
        },
        updatedAt: new Date().toISOString()
      });
      localStorage.setItem("growlyTheme", editTheme);
      applyTheme(editTheme);
      toast.success("Настройки сохранены!");
      setProfile(prev => prev ? { 
        ...prev, 
        displayName: editName,
        telegramId: editTelegramId.trim() || undefined,
        settings: { 
          ...prev.settings, 
          timezone: editTimezone, 
          notificationsEnabled: editNotifications, 
          theme: editTheme,
          badgeStyle: safeBadgeStyle,
          profileStyle: safeProfileStyle,
          soundPack: editSoundPack,
        }
      } : null);
      setEditBadgeStyle(safeBadgeStyle);
      setEditProfileStyle(safeProfileStyle);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

  const deleteQuest = async (questId: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, `users/${auth.currentUser.uid}/quests`, questId));
      toast.success("Квест удален");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${auth.currentUser.uid}/quests/${questId}`);
    }
  };

  const purchaseSubscription = async () => {
    const webApp = initTelegramWebApp();
    if (!webApp?.initData) {
      toast.error("Покупка доступна только в Telegram Mini App");
      return;
    }

    try {
      setPurchaseLoading(true);
      const response = await fetch("/api/telegram/subscription/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData, plan: subscriptionPlanChoice }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.invoiceLink) {
        throw new Error(payload?.error || "Не удалось создать счет");
      }

      if (webApp.openInvoice) {
        webApp.openInvoice(payload.invoiceLink, (status) => {
          if (status === "paid") {
            toast.success("Подписка активирована!");
            fetchProfile().catch(() => null);
          } else if (status === "cancelled") {
            toast.message("Покупка отменена");
          } else if (status === "failed") {
            toast.error("Платеж не прошел");
          }
        });
      } else {
        window.open(payload.invoiceLink, "_blank");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка покупки");
    } finally {
      setPurchaseLoading(false);
    }
  };

  const createManualPaymentRequest = async () => {
    const webApp = initTelegramWebApp();
    if (!webApp?.initData) {
      toast.error("Оплата в личке доступна только в Telegram Mini App");
      return;
    }
    try {
      setManualRequestLoading(true);
      const response = await fetch("/api/subscription/manual-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData, plan: subscriptionPlanChoice }),
      });
      const payload = await response.json();
      if (!response.ok && response.status !== 409) {
        throw new Error(payload?.error || "Не удалось отправить заявку");
      }
      if (response.ok) {
        toast.success("Заявка отправлена. Сейчас откроем личку для оплаты.");
        await fetchMyPendingManualRequest();
      } else {
        toast.message("Заявка уже есть. Открываю личку для оплаты.");
      }

      const supportLink = "https://t.me/OwOk0";
      if (webApp.openTelegramLink) {
        webApp.openTelegramLink(supportLink);
      } else {
        window.open(supportLink, "_blank");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка заявки");
    } finally {
      setManualRequestLoading(false);
    }
  };

  const fetchMyPendingManualRequest = async () => {
    const webApp = initTelegramWebApp();
    if (!webApp?.initData) return;
    try {
      const response = await fetch("/api/subscription/manual-request/my-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
      });
      const payload = await response.json();
      if (response.ok) {
        setPendingManualRequest(payload?.request || null);
      }
    } catch {
      // no-op
    }
  };

  const syncFromTelegramProfile = async () => {
    if (!auth.currentUser) return;
    const telegramId = editTelegramId.trim();
    if (!telegramId) {
      toast.error("Укажите Telegram ID для синхронизации");
      return;
    }

    try {
      setSyncLoading(true);
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/account/link-and-switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ telegramId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Не удалось синхронизировать профиль");
      if (payload?.firebaseToken) {
        await signInWithTelegramCustomToken(payload.firebaseToken);
      }
      toast.success("Профили связаны. Вы переключены на единый Telegram-профиль.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка синхронизации");
    } finally {
      setSyncLoading(false);
    }
  };

  const fetchAdminRequests = async () => {
    const webApp = initTelegramWebApp();
    if (!webApp?.initData || !isAdmin) return;
    try {
      setAdminLoading(true);
      const response = await fetch("/api/admin/subscription-requests/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
      });
      const payload = await response.json();
      if (response.ok) setAdminRequests(payload?.requests || []);
    } catch {
      // no-op
    } finally {
      setAdminLoading(false);
    }
  };

  const processAdminRequest = async (requestId: string, action: "approve" | "reject") => {
    const webApp = initTelegramWebApp();
    if (!webApp?.initData || !isAdmin) return;
    try {
      const response = await fetch(`/api/admin/subscription-requests/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData, requestId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Ошибка обработки");
      toast.success(action === "approve" ? "Подписка активирована" : "Заявка отклонена");
      await fetchAdminRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    }
  };

  const nextLvlXp = profile ? xpForNextLevel(profile.level) : 100;
  const currentLvlXp = profile ? xpForNextLevel(profile.level - 1) : 0;
  const progress = profile ? ((profile.xp - currentLvlXp) / (nextLvlXp - currentLvlXp)) * 100 : 0;
  const badgeStyle = (profile?.settings?.badgeStyle || "none") as BadgeStyle;
  const profileStyle = (profile?.settings?.profileStyle || "default") as ProfileStyle;
  const premiumCosmeticsUnlocked = profile?.settings?.premiumCosmeticsUnlocked ?? false;
  const subscriptionUntil = profile?.settings?.subscriptionUntil;
  const subscriptionPlan = profile?.settings?.subscriptionPlan || "free";
  const subscriptionActive = !!subscriptionUntil && new Date(subscriptionUntil) > new Date();
  const isAdmin = !!profile?.telegramId && (import.meta.env.VITE_ADMIN_TELEGRAM_IDS || "").split(",").map((s: string) => s.trim()).includes(String(profile.telegramId));
  const planLabelMap = {
    month: "1 месяц — 149 ₽",
    half_year: "6 месяцев — 699 ₽",
    year: "12 месяцев — 999 ₽",
  } as const;

  const badgeView: Record<Exclude<BadgeStyle, "none">, { label: string; className: string }> = {
    bronze: { label: "Bronze", className: "bg-amber-700/20 text-amber-100 border-amber-500/40" },
    silver: { label: "Silver", className: "bg-slate-200/20 text-slate-100 border-slate-300/50" },
    gold: { label: "Gold", className: "bg-yellow-400/20 text-yellow-100 border-yellow-300/50" },
    crown: { label: "Crown", className: "bg-fuchsia-500/20 text-fuchsia-100 border-fuchsia-300/50" },
  };

  const profileHeaderStyleClass =
    profileStyle === "glass"
      ? "bg-gradient-to-r from-cyan-500 to-blue-600 border border-white/30 shadow-2xl"
      : profileStyle === "neon"
        ? "bg-gradient-to-r from-indigo-600 to-cyan-500 ring-2 ring-cyan-300/50 shadow-[0_0_30px_rgba(34,211,238,0.35)]"
      : profileStyle === "cyberpunk"
        ? "bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-500 ring-2 ring-pink-400/50 shadow-[4px_4px_0px_rgba(219,39,119,0.8)] text-white"
      : profileStyle === "midnight"
        ? "bg-gradient-to-r from-slate-900 to-violet-950 ring-1 ring-violet-500/30 shadow-[0_0_40px_rgba(139,92,246,0.3)] text-violet-100"
      : profileStyle === "sunset"
        ? "bg-gradient-to-tr from-rose-600 via-red-500 to-orange-500 ring-2 ring-orange-400/50 shadow-[0_10px_40px_rgba(244,63,94,0.4)] text-white"
      : "bg-blue-600";

  useEffect(() => {
    fetchMyPendingManualRequest().catch(() => null);
    if (isAdmin) fetchAdminRequests().catch(() => null);
  }, [isAdmin]);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Загрузка приключения...</div>;

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab} 
        className="flex-1 flex flex-col overflow-hidden"
      >
        {/* Fixed Top Header */}
        <header className={`w-full text-white pt-6 pb-8 px-4 rounded-b-[2.5rem] shadow-xl relative z-20 shrink-0 ${profileHeaderStyleClass}`}>
          <div className="max-w-2xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-blue-200 text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Личный профиль</p>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-black tracking-tight leading-none">{profile?.displayName}</h1>
                    {badgeStyle !== "none" && (
                      <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-full border ${badgeView[badgeStyle].className}`}>
                        {badgeView[badgeStyle].label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {profile && profile.streakCount > 0 && (
                    <div className="bg-orange-500/20 backdrop-blur-xl px-4 py-2 rounded-2xl flex items-center gap-2 border border-orange-500/30">
                      <Flame className="w-5 h-5 text-orange-400 fill-orange-400" />
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-orange-200 uppercase leading-none">Стрик</span>
                        <span className="font-black text-lg leading-none">{profile.streakCount}</span>
                      </div>
                    </div>
                  )}
                  <div className="bg-white/10 backdrop-blur-xl px-4 py-2 rounded-2xl flex items-center gap-3 border border-white/20">
                    <div className="bg-yellow-400 p-1.5 rounded-lg">
                      <Trophy className="w-4 h-4 text-blue-900" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-blue-200 uppercase leading-none">Уровень</span>
                      <span className="font-black text-lg leading-none">{profile?.level}</span>
                    </div>
                  </div>
                </div>
              </div>

            <div className="space-y-2.5">
              <div className="flex justify-between text-[10px] font-black text-blue-100 uppercase tracking-widest px-1">
                <span>{profile?.xp} XP</span>
                <span>Ещё {nextLvlXp - (profile?.xp || 0)} XP</span>
              </div>
              <div className="h-2.5 bg-blue-950/40 rounded-full overflow-hidden p-0.5 border border-white/5">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1 }}
                  className="h-full bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                />
              </div>
            </div>

            <TabsList className="grid grid-cols-4 w-full bg-blue-950/20 p-1 rounded-2xl border border-white/10 h-14 shrink-0">
              <TabsTrigger 
                value="quests" 
                className="rounded-xl flex items-center justify-center gap-2 text-blue-100 data-[state=active]:bg-white data-[state=active]:text-blue-700 transition-all font-black text-[10px]"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">КВЕСТЫ</span>
              </TabsTrigger>
              <TabsTrigger 
                value="calendar" 
                className="rounded-xl flex items-center justify-center gap-2 text-blue-100 data-[state=active]:bg-white data-[state=active]:text-blue-700 transition-all font-black text-[10px]"
              >
                <CalendarIcon className="w-4 h-4" />
                <span className="hidden sm:inline">КАЛЕНДАРЬ</span>
              </TabsTrigger>
              <TabsTrigger 
                value="achievements" 
                className="rounded-xl flex items-center justify-center gap-2 text-blue-100 data-[state=active]:bg-white data-[state=active]:text-blue-700 transition-all font-black text-[10px]"
              >
                <Award className="w-4 h-4" />
                <span className="hidden sm:inline">ДОСТИЖЕНИЯ</span>
              </TabsTrigger>
              <TabsTrigger 
                value="settings" 
                className="rounded-xl flex items-center justify-center gap-2 text-blue-100 data-[state=active]:bg-white data-[state=active]:text-blue-700 transition-all font-black text-[10px]"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">ОПЦИИ</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto w-full px-4 pt-8 pb-24 focus:outline-none">
          <div className="max-w-2xl mx-auto w-full">
            <TabsContent value="quests" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ring-0 focus-visible:ring-0">
              <div className="flex gap-4">
                <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Выполнено</p>
                  <p className="text-2xl font-black text-blue-600">{completedCount}</p>
                </div>
                <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Активно</p>
                  <p className="text-2xl font-black text-orange-500">{quests.length}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h2 className="font-extrabold text-slate-800">Текущие цели</h2>
                </div>
                {quests.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-[2rem] border border-dashed border-slate-200">
                    <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Target className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-500 font-medium px-6">Все квесты завершены. Пора ставить новые цели!</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout" initial={false}>
                    {quests.map(quest => (
                      <QuestItem 
                        key={quest.id} 
                        quest={quest} 
                        onComplete={() => completeQuest(quest)}
                        onDelete={() => deleteQuest(quest.id)}
                        onEdit={() => {
                          setEditingQuest(quest);
                          setIsEditOpen(true);
                        }}
                      />
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </TabsContent>

            <TabsContent value="calendar" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0 outline-none">
              <CalendarView quests={quests} />
            </TabsContent>

            <TabsContent value="achievements" className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto pb-20">
              <XPProgressionChart history={xpHistory} />

              <div className="grid gap-4">
                 <AchievementTier 
                  title="Мастер квестов" 
                  current={completedCount} 
                  milestones={[10, 100, 200, 500]} 
                  description="Общее количество выполненных квестов"
                />
                <AchievementTier 
                  title="Сборщик опыта" 
                  current={profile?.xp || 0} 
                  milestones={[1000, 5000, 10000, 50000]} 
                  description="Накопленный опыт за все время"
                />
                <AchievementTier 
                  title="Уровень героя" 
                  current={profile?.level || 1} 
                  milestones={[5, 10, 25, 50]} 
                  description="Ваш текущий уровень персонажа"
                />
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
                <CardHeader>
                  <CardTitle>Настройки профиля</CardTitle>
                  <CardDescription>Персонализируйте свое приключение</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="w-4 h-4" /> Никнейм
                    </Label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-xl h-12" />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="w-4 h-4" /> Telegram ID
                    </Label>
                    <Input
                      value={editTelegramId}
                      onChange={(e) => setEditTelegramId(e.target.value)}
                      placeholder="Например: 123456789"
                      className="rounded-xl h-12"
                    />
                    <Button
                      type="button"
                      onClick={syncFromTelegramProfile}
                      disabled={syncLoading}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 font-semibold"
                    >
                      {syncLoading ? "Синхронизируем..." : "Синхронизировать с Telegram"}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Globe className="w-4 h-4" /> Часовой пояс
                    </Label>
                    <select 
                      value={editTimezone} 
                      onChange={(e) => setEditTimezone(e.target.value)}
                      className="w-full h-12 rounded-xl border border-slate-200 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Europe/Moscow">Москва (UTC+3)</option>
                      <option value="Europe/London">Лондон (UTC+0)</option>
                      <option value="America/New_York">Нью-Йорк (UTC-5)</option>
                      <option value="Asia/Tokyo">Токио (UTC+9)</option>
                      <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                        {Intl.DateTimeFormat().resolvedOptions().timeZone} (Авто)
                      </option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Settings className="w-4 h-4" /> Тема
                    </Label>
                    <select
                      value={editTheme}
                      onChange={(e) => {
                        const nextTheme = e.target.value as ThemeMode;
                        setEditTheme(nextTheme);
                        applyTheme(nextTheme);
                      }}
                      className="w-full h-12 rounded-xl border border-slate-200 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="light">Светлая</option>
                      <option value="dark">Темная</option>
                      <option value="ocean">Ocean</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Award className="w-4 h-4" /> Бейдж профиля
                    </Label>
                    <select
                      value={editBadgeStyle}
                      onChange={(e) => setEditBadgeStyle(e.target.value as BadgeStyle)}
                      className="w-full h-12 rounded-xl border border-slate-200 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="none">Без бейджа</option>
                      <option value="bronze">Bronze</option>
                      <option value="silver">Silver</option>
                      <option value="gold">Gold (Premium)</option>
                      <option value="crown">Crown (Premium)</option>
                    </select>
                    {!premiumCosmeticsUnlocked && (
                      <p className="text-xs text-slate-500">Gold и Crown доступны по подписке.</p>
                    )}
                  </div>

                  <div className="space-y-3 p-4 bg-slate-50 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Подписка Growly Pro</p>
                        <p className="text-xs text-slate-500">
                          {subscriptionActive
                            ? `Активна до ${new Date(subscriptionUntil!).toLocaleDateString()}`
                            : "Не активна"}
                        </p>
                      </div>
                      <span className="text-xs font-bold uppercase text-slate-500">{subscriptionPlan}</span>
                    </div>
                    <select
                      value={subscriptionPlanChoice}
                      onChange={(e) => setSubscriptionPlanChoice(e.target.value as "month" | "half_year" | "year")}
                      className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="month">{planLabelMap.month}</option>
                      <option value="half_year">{planLabelMap.half_year}</option>
                      <option value="year">{planLabelMap.year}</option>
                    </select>
                    <Button
                      type="button"
                      onClick={purchaseSubscription}
                      disabled={purchaseLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 font-semibold"
                    >
                      {purchaseLoading ? "Создаем счет..." : subscriptionActive ? "Продлить подписку" : "Купить подписку"}
                    </Button>
                    <Button
                      type="button"
                      onClick={createManualPaymentRequest}
                      disabled={manualRequestLoading || !!pendingManualRequest}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 font-semibold"
                    >
                      {manualRequestLoading ? "Отправляем заявку..." : pendingManualRequest ? "Заявка уже на проверке" : "Оплатить через личку"}
                    </Button>
                    <p className="text-xs text-slate-500">
                      Для оплаты в личке напишите @OwOk0 и отправьте чек. Затем дождитесь подтверждения.
                    </p>
                    {pendingManualRequest && (
                      <p className="text-xs text-amber-600">
                        Ваша заявка на проверке с {new Date(pendingManualRequest.createdAt).toLocaleString()}.
                      </p>
                    )}

                    <AlertDialog open={showBenefitsModal} onOpenChange={setShowBenefitsModal}>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" className="w-full text-blue-600 font-bold hover:bg-blue-50 rounded-xl h-10 mt-2">
                           Посмотреть все преимущества Pro 🚀
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-3xl max-w-md">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-2xl font-black text-slate-900 flex items-center gap-2">
                             Growly Pro <Flame className="w-6 h-6 text-orange-500 fill-orange-500" />
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-4 pt-4">
                            <div className="space-y-3">
                              <div className="flex gap-3">
                                <div className="bg-blue-100 p-2 rounded-xl h-fit">❄️</div>
                                <div>
                                  <p className="font-bold text-slate-900">Заморозка стрика</p>
                                  <p className="text-xs">До 5 автоматических заморозок в месяц. Стрик не сбросится, если вы пропустите день!</p>
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <div className="bg-emerald-100 p-2 rounded-xl h-fit">🎨</div>
                                <div>
                                  <p className="font-bold text-slate-900">Premium кастомизация</p>
                                  <p className="text-xs">Эксклюзивные темы (Ocean, Midnight), бейджи (Gold, Crown) и стили профиля.</p>
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <div className="bg-purple-100 p-2 rounded-xl h-fit">🔊</div>
                                <div>
                                  <p className="font-bold text-slate-900">Звуковые паки</p>
                                  <p className="text-xs">Звуки выполнения квестов из Mario, Zelda и GTA для полного погружения.</p>
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <div className="bg-orange-100 p-2 rounded-xl h-fit">⚡️</div>
                                <div>
                                  <p className="font-bold text-slate-900">Будущие обновления</p>
                                  <p className="text-xs">Приоритетный доступ к ИИ-коучу и аналитике продуктивности.</p>
                                </div>
                              </div>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogAction 
                            onClick={() => setShowBenefitsModal(false)}
                            className="bg-slate-900 text-white rounded-xl w-full"
                          >
                            Круто, спасибо!
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  {isAdmin && (
                    <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-800">Admin: заявки на подписку</p>
                        <Button type="button" onClick={fetchAdminRequests} className="h-8 px-3 bg-slate-700 hover:bg-slate-800 text-white rounded-lg">
                          {adminLoading ? "..." : "Обновить"}
                        </Button>
                      </div>
                      {adminRequests.length === 0 ? (
                        <p className="text-xs text-slate-500">Нет заявок в ожидании.</p>
                      ) : (
                        <div className="space-y-2">
                          {adminRequests.map((r) => (
                            <div key={r.id} className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                              <p className="text-xs text-slate-600">
                                {r.telegramId} · {planLabelMap[r.plan]} · {r.amountExpected / 100} ₽
                              </p>
                              <p className="text-[11px] text-slate-500">{new Date(r.createdAt).toLocaleString()}</p>
                              <div className="flex gap-2">
                                <Button type="button" onClick={() => processAdminRequest(r.id, "approve")} className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">
                                  Одобрить
                                </Button>
                                <Button type="button" onClick={() => processAdminRequest(r.id, "reject")} className="h-8 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg">
                                  Отклонить
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="w-4 h-4" /> Стиль профиля
                    </Label>
                    <select
                      value={editProfileStyle}
                      onChange={(e) => setEditProfileStyle(e.target.value as ProfileStyle)}
                      className="w-full h-12 rounded-xl border border-slate-200 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="default">Default</option>
                      <option value="glass">Glass</option>
                      <option value="neon">Neon (Premium)</option>
                      <option value="cyberpunk">Cyberpunk (Premium)</option>
                      <option value="midnight">Midnight (Premium)</option>
                      <option value="sunset">Sunset (Premium)</option>
                    </select>
                    {!premiumCosmeticsUnlocked && (
                      <p className="text-xs text-slate-500">Premium стили доступны по подписке.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Bell className="w-4 h-4" /> Звук выполнения квеста
                    </Label>
                    <select
                      value={editSoundPack}
                      onChange={(e) => setEditSoundPack(e.target.value as SoundPack)}
                      className="w-full h-12 rounded-xl border border-slate-200 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="default">Стандартный</option>
                      <option value="mario">Mario (Coin) (Premium)</option>
                      <option value="zelda">Zelda (Secret) (Premium)</option>
                      <option value="gta">GTA (Mission Passed) (Premium)</option>
                    </select>
                    {!premiumCosmeticsUnlocked && (
                      <p className="text-xs text-slate-500">Звуковые паки доступны по подписке.</p>
                    )}
                  </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2 text-base">
                      <Bell className="w-4 h-4 text-blue-600" /> Уведомления
                    </Label>
                    <p className="text-xs text-slate-500">Присылать напоминания в бота</p>
                  </div>
                  <Checkbox 
                    checked={editNotifications} 
                    onCheckedChange={(checked) => setEditNotifications(checked as boolean)}
                    className="w-6 h-6 rounded-lg"
                  />
                </div>

                <Button onClick={saveSettings} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 font-bold shadow-lg shadow-blue-100">
                  Сохранить изменения
                </Button>

                <div className="pt-4 border-t border-slate-100">
                  <Button variant="outline" className="w-full rounded-xl h-12 text-slate-500 border-slate-100" onClick={() => auth.signOut()}>
                    Выйти из аккаунта
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </main>
    </Tabs>

      <CreateQuestDialog onCreated={fetchProfile} />
      <EditQuestDialog quest={editingQuest} open={isEditOpen} onOpenChange={setIsEditOpen} />
      
      <AlertDialog open={showLostStreakModal} onOpenChange={setShowLostStreakModal}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <Flame className="w-6 h-6" /> О нет! Ваш огонек погас!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              Вы пропустили выполнение квестов и ваш стрик из <b>{profile?.settings?.pendingLostStreak} дней</b> обнулился. 
              <br/><br/>
              Но вы можете спасти его! Оформите подписку <b>Growly Pro</b> прямо сейчас, и мы автоматически восстановим ваш стрик, а также дадим вам до 5 заморозок стрика каждый месяц.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={handleDismissLostStreak} className="rounded-xl w-full sm:w-auto text-slate-500 border-slate-200">
              Смириться с потерей
            </Button>
            <Button onClick={() => {
              setShowLostStreakModal(false);
              setActiveTab("settings");
            }} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl w-full sm:w-auto shadow-lg shadow-emerald-200">
              Перейти к подписке
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AchievementTier({ title, current, milestones, description }: { title: string, current: number, milestones: number[], description: string }) {
  return (
    <Card className="border-none shadow-sm rounded-3xl bg-white p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-yellow-50 rounded-xl">
          <Trophy className="w-5 h-5 text-yellow-500" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800">{title}</h3>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{description}</p>
        </div>
      </div>
      
      <div className="flex justify-between gap-1">
        {milestones.map((ms, i) => {
          const isReached = current >= ms;
          const isNext = !isReached && (i === 0 || current >= milestones[i-1]);
          return (
            <div key={ms} className="flex-1 flex flex-col items-center gap-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isReached ? "bg-green-100 text-green-600" : isNext ? "bg-blue-50 text-blue-400 animate-pulse" : "bg-slate-50 text-slate-200"
              }`}>
                <Award className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-bold ${isReached ? "text-green-600" : "text-slate-400"}`}>{ms}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function QuestItem({ quest, onComplete, onEdit, onDelete }: { quest: Quest, onComplete: () => void, onEdit: () => void, onDelete: () => void }) {
  const [isCompleting, setIsCompleting] = useState(false);
  const isDaily = quest.type === QuestType.DAILY;
  const isExpired = quest.deadline && new Date(quest.deadline) < new Date() && quest.status === QuestStatus.ACTIVE;

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCompleting(true);
    setTimeout(() => {
      onComplete();
    }, 600);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ 
        opacity: isCompleting ? 0 : 1, 
        y: isCompleting ? -20 : 0,
        scale: isCompleting ? 1.05 : 1,
        filter: isCompleting ? "brightness(1.5)" : "brightness(1)"
      }}
      transition={{ duration: 0.6 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="group"
      onClick={onEdit}
    >
      <Card className={`border-none shadow-sm group-hover:shadow-md transition-all rounded-[2rem] overflow-hidden bg-white cursor-pointer active:scale-[0.98] ${isExpired ? "opacity-75" : ""} ${isCompleting ? "ring-4 ring-green-400" : ""}`}>
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant="secondary" className={`${isDaily ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"} border-none text-[10px] uppercase font-black px-2 py-0.5 rounded-lg`}>
                {isDaily ? "Повтор" : "Квест"}
              </Badge>
              {quest.deadline && (
                <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg ${isExpired ? "bg-red-50 text-red-500" : "bg-slate-50 text-slate-400"}`}>
                  <Clock className="w-3 h-3" />
                  {new Date(quest.deadline).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' })}
                </div>
              )}
              {isDaily && quest.recurringDays?.length > 0 && (
                 <div className="flex gap-0.5">
                    {[1,2,3,4,5,6,0].map(d => (
                       <div key={d} className={`w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold ${quest.recurringDays.includes(d) ? "bg-orange-200 text-orange-700" : "bg-slate-100 text-slate-300"}`}>
                         {["В","П","В","С","Ч","П","С"][d]}
                       </div>
                    ))}
                 </div>
              )}
            </div>
            <h3 className="font-extrabold text-slate-900 text-lg leading-tight mb-1">{quest.title}</h3>
            {quest.description && (
              <p className="text-sm text-slate-500 line-clamp-1">
                {quest.description.replace(/<[^>]*>?/gm, '')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
             <div className="hidden sm:flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity">
               <Edit2 className="w-4 h-4 text-slate-300" />
               <span className="text-[8px] font-black text-slate-300 uppercase">Изм.</span>
             </div>
             
             <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      onClick={(e) => e.stopPropagation()}
                      size="icon"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 h-10 w-10 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  }
                />
                <AlertDialogContent className="rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить квест?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Это действие нельзя будет отменить. Квест исчезнет навсегда.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={(e) => e.stopPropagation()} className="rounded-xl">Отмена</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-xl"
                    >
                      Удалить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
             </AlertDialog>

             <div className="hidden sm:flex flex-col items-end group-hover:hidden min-w-[60px]">
               <span className="text-lg font-black text-blue-600">+{quest.xpReward}</span>
               <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">ОПЫТ</span>
             </div>
             <Button
              onClick={handleComplete}
              className="bg-blue-50 hover:bg-green-100 text-blue-600 hover:text-green-600 w-14 h-14 rounded-3xl flex items-center justify-center transition-all border-none shadow-none active:scale-90"
             >
                <CheckCircle2 className="w-8 h-8" />
             </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
