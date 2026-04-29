export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
  };
  ready: () => void;
  expand: () => void;
  openTelegramLink?: (url: string) => void;
  openInvoice?: (url: string, callback?: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

export function getTelegramWebApp(): TelegramWebApp | null {
  const windowWithTelegram = window as TelegramWindow;
  return windowWithTelegram.Telegram?.WebApp ?? null;
}

export function initTelegramWebApp() {
  const webApp = getTelegramWebApp();
  if (!webApp) {
    return null;
  }

  webApp.ready();
  webApp.expand();
  return webApp;
}
