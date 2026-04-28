import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signIn } from "@/lib/firebase";
import { LogIn, Sparkles } from "lucide-react";
import { motion } from "motion/react";

export default function Login() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-md border-none shadow-xl bg-white/80 backdrop-blur">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">QuestLife</CardTitle>
            <CardDescription className="text-slate-500 mt-2">
              Геймифицируй свою жизнь. Выполняй квесты, получай опыт и повышай уровень.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button 
              onClick={signIn} 
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <LogIn className="w-5 h-5 mr-2" />
              Войти через Google
            </Button>
            <p className="text-xs text-center text-slate-500">
              В Telegram Mini App вход выполняется автоматически
            </p>
            <p className="text-xs text-center text-slate-400 mt-4">
              Ваш прогресс будет синхронизирован между устройствами
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
