import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import dotenv from "dotenv";
import { initializeApp as initializeAdminApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: ".env.local" });

function buildDataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key !== "hash") {
      pairs.push(`${key}=${value}`);
    }
  }
  return pairs.sort().join("\n");
}

function verifyTelegramInitData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return false;
  }

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const dataCheckString = buildDataCheckString(params);
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return signature === hash;
}

function isTelegramAuthFresh(initData: string, maxAgeSeconds = 3600): boolean {
  const params = new URLSearchParams(initData);
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  return now - authDate <= maxAgeSeconds;
}

function getTelegramUserFromInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw) as { id: number; username?: string; first_name?: string; last_name?: string };
  } catch {
    return null;
  }
}

function ensureFirebaseAdmin() {
  if (getApps().length > 0) {
    return;
  }

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountRaw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON in .env.local");
  }

  let serviceAccount: Record<string, string>;
  try {
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON");
  }

  initializeAdminApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key?.replace(/\\n/g, "\n"),
    }),
  });
}

async function setTelegramMenuButton(botToken: string, text: string, url: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: {
        type: "web_app",
        text,
        web_app: { url },
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description || "Failed to set Telegram menu button");
  }

  return payload;
}

async function copySubcollectionIfMissing(sourceUid: string, targetUid: string, subcollection: string) {
  const db = getFirestore();
  const sourceRef = db.collection("users").doc(sourceUid).collection(subcollection);
  const targetRef = db.collection("users").doc(targetUid).collection(subcollection);

  const sourceDocs = await sourceRef.get();
  if (sourceDocs.empty) {
    return 0;
  }

  const targetDocs = await targetRef.get();
  const existingTargetIds = new Set(targetDocs.docs.map((d) => d.id));
  let copied = 0;

  const batch = db.batch();
  for (const sourceDoc of sourceDocs.docs) {
    if (existingTargetIds.has(sourceDoc.id)) {
      continue;
    }
    batch.set(targetRef.doc(sourceDoc.id), sourceDoc.data(), { merge: true });
    copied += 1;
  }

  if (copied > 0) {
    await batch.commit();
  }

  return copied;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "QuestLife Server is running" });
  });

  // Future Telegram Webhook placeholder
  app.post("/api/telegram-webhook", (req, res) => {
    console.log("Telegram Webhook received:", req.body);
    res.sendStatus(200);
  });

  app.post("/api/telegram/validate", (req, res) => {
    const initData = req.body?.initData;
    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      return res.status(500).json({ error: "Missing BOT_TOKEN in .env.local" });
    }

    if (!initData || typeof initData !== "string") {
      return res.status(400).json({ error: "initData is required" });
    }

    const isValid = verifyTelegramInitData(initData, botToken);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid Telegram initData" });
    }
    if (!isTelegramAuthFresh(initData)) {
      return res.status(401).json({ error: "Expired Telegram initData" });
    }

    const user = getTelegramUserFromInitData(initData);

    return res.json({ ok: true, user });
  });

  app.post("/api/telegram/firebase-token", async (req, res) => {
    const initData = req.body?.initData;
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ error: "Missing BOT_TOKEN in .env.local" });
    }
    if (!initData || typeof initData !== "string") {
      return res.status(400).json({ error: "initData is required" });
    }

    if (!verifyTelegramInitData(initData, botToken)) {
      return res.status(401).json({ error: "Invalid Telegram initData" });
    }
    if (!isTelegramAuthFresh(initData)) {
      return res.status(401).json({ error: "Expired Telegram initData" });
    }

    const tgUser = getTelegramUserFromInitData(initData);
    if (!tgUser?.id) {
      return res.status(400).json({ error: "Telegram user not found in initData" });
    }

    try {
      ensureFirebaseAdmin();
      const firebaseUid = `tg_${tgUser.id}`;
      const firebaseToken = await getAuth().createCustomToken(firebaseUid, {
        telegramId: String(tgUser.id),
        telegramUsername: tgUser.username || "",
      });
      return res.json({ ok: true, firebaseToken, user: tgUser, uid: firebaseUid });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/telegram/migrate-user-data", async (req, res) => {
    const initData = req.body?.initData;
    const targetUid = req.body?.targetUid;
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ error: "Missing BOT_TOKEN in .env.local" });
    }
    if (!initData || typeof initData !== "string") {
      return res.status(400).json({ error: "initData is required" });
    }
    if (!targetUid || typeof targetUid !== "string") {
      return res.status(400).json({ error: "targetUid is required" });
    }

    if (!verifyTelegramInitData(initData, botToken) || !isTelegramAuthFresh(initData)) {
      return res.status(401).json({ error: "Invalid or expired Telegram initData" });
    }

    const tgUser = getTelegramUserFromInitData(initData);
    if (!tgUser?.id) {
      return res.status(400).json({ error: "Telegram user not found in initData" });
    }

    const expectedUid = `tg_${tgUser.id}`;
    if (targetUid !== expectedUid) {
      return res.status(403).json({ error: "targetUid does not match Telegram user" });
    }

    try {
      ensureFirebaseAdmin();
      const db = getFirestore();
      const usersRef = db.collection("users");
      const targetRef = usersRef.doc(targetUid);
      const sourceQuery = await usersRef.where("telegramId", "==", String(tgUser.id)).get();
      const sourceDoc = sourceQuery.docs.find((d) => d.id !== targetUid) || null;

      if (!sourceDoc) {
        return res.json({ ok: true, migrated: false, reason: "no-source-profile" });
      }

      const sourceData = sourceDoc.data();
      const targetSnap = await targetRef.get();
      const targetData = targetSnap.exists ? targetSnap.data() || {} : {};

      const mergedProfile = {
        ...sourceData,
        ...targetData,
        id: targetUid,
        telegramId: String(tgUser.id),
        updatedAt: new Date().toISOString(),
      };

      await targetRef.set(mergedProfile, { merge: true });
      const copiedQuests = await copySubcollectionIfMissing(sourceDoc.id, targetUid, "quests");
      const copiedXpHistory = await copySubcollectionIfMissing(sourceDoc.id, targetUid, "xpHistory");

      return res.json({
        ok: true,
        migrated: true,
        sourceUid: sourceDoc.id,
        targetUid,
        copiedQuests,
        copiedXpHistory,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/telegram/setup-menu-button", async (req, res) => {
    const botToken = process.env.BOT_TOKEN;
    const appUrl = req.body?.url || process.env.APP_URL;
    const buttonText = req.body?.text || "Open QuestLife";

    if (!botToken) {
      return res.status(500).json({ error: "Missing BOT_TOKEN in .env.local" });
    }
    if (!appUrl || typeof appUrl !== "string") {
      return res.status(400).json({ error: "Missing app URL (body.url or APP_URL)" });
    }
    if (!/^https:\/\//i.test(appUrl)) {
      return res.status(400).json({ error: "Telegram Mini App URL must start with https://" });
    }

    try {
      await setTelegramMenuButton(botToken, buttonText, appUrl);
      return res.json({ ok: true, url: appUrl, text: buttonText });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Error starting server:", err);
});
