import { useEffect } from "react";
import { linkTelegramToCurrentUser, signInWithTelegramCustomToken, useAuth } from "./lib/firebase";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import { Toaster } from "sonner";
import { initTelegramWebApp } from "./lib/telegram";

export default function App() {
  const { user, loading } = useAuth();

  useEffect(() => {
    const webApp = initTelegramWebApp();
    if (!webApp?.initData || user) {
      return;
    }

    fetch("/api/telegram/firebase-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: webApp.initData }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Telegram Firebase token request failed");
        }
        return response.json();
      })
      .then(async (payload) => {
        if (payload?.firebaseToken) {
          await signInWithTelegramCustomToken(payload.firebaseToken);
        }
        if (payload?.user) {
          localStorage.setItem("telegramUser", JSON.stringify(payload.user));
        }
        console.log("Telegram user verified:", payload.user);
      })
      .catch((error) => {
        console.error(error);
      });
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const telegramUserRaw = localStorage.getItem("telegramUser");
    if (!telegramUserRaw) {
      return;
    }

    try {
      const telegramUser = JSON.parse(telegramUserRaw);
      if (telegramUser?.id) {
        linkTelegramToCurrentUser(telegramUser).catch((error) => {
          console.error("Telegram linking failed:", error);
        });
      }
    } catch (error) {
      console.error("Invalid telegram user cache:", error);
    }
  }, [user]);

  useEffect(() => {
    const webApp = initTelegramWebApp();
    if (!webApp?.initData || !user || !user.uid.startsWith("tg_")) {
      return;
    }

    const migrateKey = `telegramMigrationDone:${user.uid}`;
    if (localStorage.getItem(migrateKey) === "1") {
      return;
    }

    fetch("/api/telegram/migrate-user-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: webApp.initData, targetUid: user.uid }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Telegram migration failed");
        }
        localStorage.setItem(migrateKey, "1");
        console.log("Telegram migration result:", payload);
      })
      .catch((error) => {
        console.error(error);
      });
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl" />
          <div className="w-32 h-2 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 font-sans selection:bg-blue-100 selection:text-blue-900">
        {user ? <Dashboard /> : <Login />}
      </div>
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
