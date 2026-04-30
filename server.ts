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

function getAdminDb() {
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  return databaseId ? getFirestore(undefined, databaseId) : getFirestore();
}

function getBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
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

async function createTelegramInvoiceLink(botToken: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok || !result?.ok || !result?.result) {
    throw new Error(result?.description || "Failed to create invoice link");
  }

  return result.result as string;
}

async function answerTelegramPreCheckoutQuery(botToken: string, preCheckoutQueryId: string, ok: boolean, errorMessage?: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
      error_message: errorMessage,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result?.ok) {
    throw new Error(result?.description || "Failed to answer pre-checkout query");
  }
}

async function activateSubscriptionForTelegramUser(telegramUserId: number, durationDays: number) {
  ensureFirebaseAdmin();
  const db = getAdminDb();
  const uid = `tg_${telegramUserId}`;
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();

  const now = new Date();
  const currentUntilRaw = userSnap.data()?.settings?.subscriptionUntil;
  const currentUntil = currentUntilRaw ? new Date(currentUntilRaw) : null;
  const baseDate = currentUntil && currentUntil > now ? currentUntil : now;
  const nextUntil = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

  await userRef.set({
    id: uid,
    telegramId: String(telegramUserId),
    settings: {
      premiumCosmeticsUnlocked: true,
      subscriptionPlan: "pro",
      subscriptionUntil: nextUntil.toISOString(),
    },
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

type SubscriptionPlanKey = "month" | "half_year" | "year";

function getSubscriptionConfig(plan: SubscriptionPlanKey, paymentMode: string) {
  const configs = {
    month: {
      durationDays: Number(process.env.TELEGRAM_SUBSCRIPTION_DAYS_MONTH || "30"),
      stars: Number(process.env.TELEGRAM_SUBSCRIPTION_PRICE_STARS_MONTH || "199"),
      rubKopecs: Number(process.env.TELEGRAM_SUBSCRIPTION_PRICE_RUB_KOPECS_MONTH || "19900"),
      label: "1 месяц",
    },
    half_year: {
      durationDays: Number(process.env.TELEGRAM_SUBSCRIPTION_DAYS_HALF_YEAR || "180"),
      stars: Number(process.env.TELEGRAM_SUBSCRIPTION_PRICE_STARS_HALF_YEAR || "999"),
      rubKopecs: Number(process.env.TELEGRAM_SUBSCRIPTION_PRICE_RUB_KOPECS_HALF_YEAR || "99900"),
      label: "6 месяцев",
    },
    year: {
      durationDays: Number(process.env.TELEGRAM_SUBSCRIPTION_DAYS_YEAR || "365"),
      stars: Number(process.env.TELEGRAM_SUBSCRIPTION_PRICE_STARS_YEAR || "1799"),
      rubKopecs: Number(process.env.TELEGRAM_SUBSCRIPTION_PRICE_RUB_KOPECS_YEAR || "179900"),
      label: "12 месяцев",
    },
  };
  const cfg = configs[plan];
  return {
    durationDays: cfg.durationDays,
    amount: paymentMode === "yookassa" ? cfg.rubKopecs : cfg.stars,
    label: cfg.label,
  };
}

function parseAdminTelegramIds(): Set<string> {
  const raw = process.env.ADMIN_TELEGRAM_IDS || "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

function validateTelegramInitDataOrThrow(initData: string, botToken: string) {
  if (!verifyTelegramInitData(initData, botToken) || !isTelegramAuthFresh(initData)) {
    throw new Error("Invalid or expired Telegram initData");
  }
  const tgUser = getTelegramUserFromInitData(initData);
  if (!tgUser?.id) {
    throw new Error("Telegram user not found in initData");
  }
  return tgUser;
}

async function copySubcollectionIfMissing(sourceUid: string, targetUid: string, subcollection: string) {
  const db = getAdminDb();
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
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Growly Server is running" });
  });

  app.post("/api/telegram-webhook", async (req, res) => {
    try {
      const update = req.body;
      const preCheckoutQuery = update?.pre_checkout_query;
      const message = update?.message;
      const successfulPayment = message?.successful_payment;
      const telegramUserId = message?.from?.id;

      if (preCheckoutQuery?.id) {
        await answerTelegramPreCheckoutQuery(botTokenFromEnv(), preCheckoutQuery.id, true);
      }

      if (successfulPayment && telegramUserId) {
        const invoicePayload = successfulPayment?.invoice_payload as string | undefined;
        const planFromPayload = (invoicePayload?.split("_")[2] as SubscriptionPlanKey | undefined) || "month";
        const durationDays = getSubscriptionConfig(planFromPayload, "stars").durationDays;
        await activateSubscriptionForTelegramUser(Number(telegramUserId), durationDays);
      }
      res.sendStatus(200);
    } catch (error) {
      console.error("Telegram webhook processing error:", error);
      res.sendStatus(200);
    }
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
      const db = getAdminDb();
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
    const buttonText = req.body?.text || "Open Growly";

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

  app.post("/api/telegram/subscription/create-invoice", async (req, res) => {
    const initData = req.body?.initData;
    const plan = (req.body?.plan as SubscriptionPlanKey) || "month";
    const botToken = process.env.BOT_TOKEN;
    const providerToken = process.env.TELEGRAM_PROVIDER_TOKEN || "";
    const paymentMode = (process.env.TELEGRAM_PAYMENT_MODE || "stars").toLowerCase();
    const allowedPlans: SubscriptionPlanKey[] = ["month", "half_year", "year"];
    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({ error: "Unsupported subscription plan" });
    }
    const { durationDays, amount, label } = getSubscriptionConfig(plan, paymentMode);

    if (!botToken) {
      return res.status(500).json({ error: "Missing BOT_TOKEN in .env.local" });
    }
    if (!initData || typeof initData !== "string") {
      return res.status(400).json({ error: "initData is required" });
    }
    if (!verifyTelegramInitData(initData, botToken) || !isTelegramAuthFresh(initData)) {
      return res.status(401).json({ error: "Invalid or expired Telegram initData" });
    }
    const tgUser = getTelegramUserFromInitData(initData);
    if (!tgUser?.id) {
      return res.status(400).json({ error: "Telegram user not found in initData" });
    }

    try {
      const commonPayload = {
        title: "Growly Pro",
        description: `Подписка Growly Pro: ${label}`,
        payload: `growly_pro_${plan}_${tgUser.id}_${Date.now()}`,
      };

      const invoicePayload = paymentMode === "yookassa"
        ? {
            ...commonPayload,
            provider_token: providerToken,
            currency: "RUB",
            prices: [{ label: `Growly Pro ${label}`, amount }],
          }
        : {
            ...commonPayload,
            provider_token: "",
            currency: "XTR",
            prices: [{ label: `Growly Pro ${label}`, amount }],
            subscription_period: 2592000,
          };

      if (paymentMode === "yookassa" && !providerToken) {
        return res.status(500).json({ error: "Missing TELEGRAM_PROVIDER_TOKEN for YooKassa mode" });
      }

      const invoiceLink = await createTelegramInvoiceLink(botToken, invoicePayload);
      return res.json({
        ok: true,
        invoiceLink,
        durationDays,
        plan,
        paymentMode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/subscription/manual-request", async (req, res) => {
    const initData = req.body?.initData;
    const plan = (req.body?.plan as SubscriptionPlanKey) || "month";
    const botToken = process.env.BOT_TOKEN;
    const paymentMode = "yookassa";
    const allowedPlans: SubscriptionPlanKey[] = ["month", "half_year", "year"];

    if (!botToken) return res.status(500).json({ error: "Missing BOT_TOKEN in .env.local" });
    if (!initData || typeof initData !== "string") return res.status(400).json({ error: "initData is required" });
    if (!allowedPlans.includes(plan)) return res.status(400).json({ error: "Unsupported subscription plan" });

    try {
      const tgUser = validateTelegramInitDataOrThrow(initData, botToken);
      ensureFirebaseAdmin();
      const db = getAdminDb();
      const uid = `tg_${tgUser.id}`;
      const requestsRef = db.collection("subscriptionRequests");

      const sameUser = await requestsRef.where("uid", "==", uid).get();
      const pendingExisting = sameUser.docs.find((d) => d.data().status === "pending");
      if (pendingExisting) {
        return res.status(409).json({ error: "У вас уже есть заявка на проверке" });
      }

      const config = getSubscriptionConfig(plan, paymentMode);
      const docRef = requestsRef.doc();
      await docRef.set({
        id: docRef.id,
        uid,
        telegramId: String(tgUser.id),
        plan,
        amountExpected: config.amount,
        currency: "RUB",
        durationDays: config.durationDays,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      return res.json({ ok: true, requestId: docRef.id, plan, amountExpected: config.amount });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(401).json({ error: message });
    }
  });

  app.post("/api/subscription/manual-request/my-pending", async (req, res) => {
    const initData = req.body?.initData;
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return res.status(500).json({ error: "Missing BOT_TOKEN in .env.local" });
    if (!initData || typeof initData !== "string") return res.status(400).json({ error: "initData is required" });

    try {
      const tgUser = validateTelegramInitDataOrThrow(initData, botToken);
      ensureFirebaseAdmin();
      const db = getAdminDb();
      const uid = `tg_${tgUser.id}`;
      const sameUser = await db.collection("subscriptionRequests").where("uid", "==", uid).get();
      const pending = sameUser.docs
        .map((d) => d.data())
        .filter((r) => r.status === "pending")
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
      return res.json({ ok: true, request: pending });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(401).json({ error: message });
    }
  });

  app.post("/api/admin/subscription-requests/list", async (req, res) => {
    const initData = req.body?.initData;
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return res.status(500).json({ error: "Missing BOT_TOKEN in .env.local" });
    if (!initData || typeof initData !== "string") return res.status(400).json({ error: "initData is required" });

    try {
      const tgUser = validateTelegramInitDataOrThrow(initData, botToken);
      const adminIds = parseAdminTelegramIds();
      if (!adminIds.has(String(tgUser.id))) return res.status(403).json({ error: "Admin access required" });

      ensureFirebaseAdmin();
      const db = getAdminDb();
      const snapshot = await db.collection("subscriptionRequests").where("status", "==", "pending").get();
      const requests = snapshot.docs
        .map((d) => d.data())
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return res.json({ ok: true, requests });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(401).json({ error: message });
    }
  });

  app.post("/api/admin/subscription-requests/approve", async (req, res) => {
    const initData = req.body?.initData;
    const requestId = req.body?.requestId;
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return res.status(500).json({ error: "Missing BOT_TOKEN in .env.local" });
    if (!initData || typeof initData !== "string") return res.status(400).json({ error: "initData is required" });
    if (!requestId || typeof requestId !== "string") return res.status(400).json({ error: "requestId is required" });

    try {
      const tgUser = validateTelegramInitDataOrThrow(initData, botToken);
      const adminIds = parseAdminTelegramIds();
      if (!adminIds.has(String(tgUser.id))) return res.status(403).json({ error: "Admin access required" });

      ensureFirebaseAdmin();
      const db = getAdminDb();
      const requestRef = db.collection("subscriptionRequests").doc(requestId);
      const requestSnap = await requestRef.get();
      if (!requestSnap.exists) return res.status(404).json({ error: "Request not found" });

      const data = requestSnap.data() as { status?: string; telegramId?: string; durationDays?: number };
      if (data.status !== "pending") return res.status(400).json({ error: "Request is not pending" });
      if (!data.telegramId) return res.status(400).json({ error: "Missing telegramId in request" });

      await activateSubscriptionForTelegramUser(Number(data.telegramId), Number(data.durationDays || 30));
      await requestRef.set({
        status: "approved",
        processedAt: new Date().toISOString(),
        processedByTelegramId: String(tgUser.id),
      }, { merge: true });

      return res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(401).json({ error: message });
    }
  });

  app.post("/api/admin/subscription-requests/reject", async (req, res) => {
    const initData = req.body?.initData;
    const requestId = req.body?.requestId;
    const reason = req.body?.reason || "";
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return res.status(500).json({ error: "Missing BOT_TOKEN in .env.local" });
    if (!initData || typeof initData !== "string") return res.status(400).json({ error: "initData is required" });
    if (!requestId || typeof requestId !== "string") return res.status(400).json({ error: "requestId is required" });

    try {
      const tgUser = validateTelegramInitDataOrThrow(initData, botToken);
      const adminIds = parseAdminTelegramIds();
      if (!adminIds.has(String(tgUser.id))) return res.status(403).json({ error: "Admin access required" });

      ensureFirebaseAdmin();
      await getAdminDb().collection("subscriptionRequests").doc(requestId).set({
        status: "rejected",
        reason: String(reason),
        processedAt: new Date().toISOString(),
        processedByTelegramId: String(tgUser.id),
      }, { merge: true });

      return res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(401).json({ error: message });
    }
  });

  app.post("/api/account/sync-from-telegram", async (req, res) => {
    const idToken = getBearerToken(req);
    const telegramIdRaw = req.body?.telegramId;
    if (!idToken) return res.status(401).json({ error: "Missing Authorization Bearer token" });
    if (!telegramIdRaw || typeof telegramIdRaw !== "string") return res.status(400).json({ error: "telegramId is required" });

    try {
      ensureFirebaseAdmin();
      const decoded = await getAuth().verifyIdToken(idToken);
      const targetUid = decoded.uid;
      const telegramId = telegramIdRaw.trim();
      const sourceUid = `tg_${telegramId}`;

      const db = getAdminDb();
      const sourceRef = db.collection("users").doc(sourceUid);
      const targetRef = db.collection("users").doc(targetUid);
      const [sourceSnap, targetSnap] = await Promise.all([sourceRef.get(), targetRef.get()]);

      if (!sourceSnap.exists) {
        return res.status(404).json({ error: "Telegram profile not found" });
      }

      const sourceData = sourceSnap.data() || {};
      const targetData = targetSnap.exists ? targetSnap.data() || {} : {};

      const mergedProfile = {
        ...sourceData,
        ...targetData,
        id: targetUid,
        telegramId,
        updatedAt: new Date().toISOString(),
      };
      await targetRef.set(mergedProfile, { merge: true });

      const copiedQuests = await copySubcollectionIfMissing(sourceUid, targetUid, "quests");
      const copiedXpHistory = await copySubcollectionIfMissing(sourceUid, targetUid, "xpHistory");

      return res.json({
        ok: true,
        sourceUid,
        targetUid,
        copiedQuests,
        copiedXpHistory,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/account/link-and-switch", async (req, res) => {
    const idToken = getBearerToken(req);
    const telegramIdRaw = req.body?.telegramId;
    if (!idToken) return res.status(401).json({ error: "Missing Authorization Bearer token" });
    if (!telegramIdRaw || typeof telegramIdRaw !== "string") return res.status(400).json({ error: "telegramId is required" });

    try {
      ensureFirebaseAdmin();
      const decoded = await getAuth().verifyIdToken(idToken);
      const sourceUid = decoded.uid;
      const telegramId = telegramIdRaw.trim();
      const targetUid = `tg_${telegramId}`;

      const db = getAdminDb();
      const sourceRef = db.collection("users").doc(sourceUid);
      const targetRef = db.collection("users").doc(targetUid);
      const [sourceSnap, targetSnap] = await Promise.all([sourceRef.get(), targetRef.get()]);

      if (!sourceSnap.exists) return res.status(404).json({ error: "Current profile not found" });

      const sourceData = sourceSnap.data() || {};
      const targetData = targetSnap.exists ? targetSnap.data() || {} : {};
      const mergedProfile = {
        ...sourceData,
        ...targetData,
        id: targetUid,
        telegramId,
        updatedAt: new Date().toISOString(),
      };

      await targetRef.set(mergedProfile, { merge: true });
      const copiedQuests = await copySubcollectionIfMissing(sourceUid, targetUid, "quests");
      const copiedXpHistory = await copySubcollectionIfMissing(sourceUid, targetUid, "xpHistory");
      const firebaseToken = await getAuth().createCustomToken(targetUid, { telegramId });

      return res.json({
        ok: true,
        sourceUid,
        targetUid,
        copiedQuests,
        copiedXpHistory,
        firebaseToken,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  function botTokenFromEnv() {
    const token = process.env.BOT_TOKEN;
    if (!token) throw new Error("Missing BOT_TOKEN in .env.local");
    return token;
  }

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
