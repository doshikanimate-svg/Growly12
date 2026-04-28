import { useAuth } from "./lib/firebase";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import { Toaster } from "sonner";

export default function App() {
  const { user, loading } = useAuth();

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
