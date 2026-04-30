import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect } from "react";
import { QuestType, QuestStatus } from "@/types";
import { Plus, Target, Repeat, Bell, FileText, AlignLeft } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "@/lib/error-handler";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import RichTextEditor from "./RichTextEditor";

const DAYS = [
  { label: "Пн", value: 1 },
  { label: "Вт", value: 2 },
  { label: "Ср", value: 3 },
  { label: "Чт", value: 4 },
  { label: "Пт", value: 5 },
  { label: "Сб", value: 6 },
  { label: "Вс", value: 0 },
];

export default function CreateQuestDialog({ 
  onCreated, 
  initialDeadline = "", 
  open: externalOpen, 
  onOpenChange: setExternalOpen 
}: { 
  onCreated: () => void, 
  initialDeadline?: string,
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = setExternalOpen !== undefined ? setExternalOpen : setInternalOpen;

  const [loading, setLoading] = useState(false);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [xpReward, setXpReward] = useState("50");
  const [type, setType] = useState<QuestType>(QuestType.ONE_TIME);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [deadline, setDeadline] = useState(initialDeadline);
  const [notifyAdvance, setNotifyAdvance] = useState("30"); // minutes
  const [showRichEditor, setShowRichEditor] = useState(false);

  useEffect(() => {
    if (initialDeadline) setDeadline(initialDeadline);
  }, [initialDeadline]);

  const toggleDay = (day: number) => {
    setRecurringDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    if (type === QuestType.DAILY && recurringDays.length === 0) {
      toast.error("Выберите хотя бы один день для повторения");
      return;
    }

    setLoading(true);
    const questId = crypto.randomUUID();
    const path = `users/${auth.currentUser.uid}/quests/${questId}`;

    const newQuest = {
      id: questId,
      userId: auth.currentUser.uid,
      title,
      description,
      xpReward: parseInt(xpReward),
      type,
      status: QuestStatus.ACTIVE,
      recurringDays: type === QuestType.DAILY ? recurringDays : [],
      deadline: deadline || null,
      notifyAdvance: deadline ? parseInt(notifyAdvance) : null,
      notified: false,
      category: "Personal",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, `users/${auth.currentUser.uid}/quests`, questId), newQuest);
      toast.success("Квест создан!");
      setOpen(false);
      onCreated();
      // Reset form
      setTitle("");
      setDescription("");
      setDeadline("");
      setRecurringDays([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-xl text-white"><Plus className="w-8 h-8" /></Button>} />
      <DialogContent className="sm:max-w-[425px] rounded-3xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Новый Квест</DialogTitle>
            <DialogDescription>
              Создай себе испытание в реальной жизни.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Название</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Пробежка 5км"
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Описание (необязательно)</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 px-2 text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => setShowRichEditor(!showRichEditor)}
                >
                  {showRichEditor ? (
                    <><AlignLeft className="w-3 h-3 mr-1" /> Обычный текст</>
                  ) : (
                    <><FileText className="w-3 h-3 mr-1" /> Форматирование</>
                  )}
                </Button>
              </div>
              {showRichEditor ? (
                <RichTextEditor 
                  value={description} 
                  onChange={setDescription} 
                  placeholder="Опишите детали квеста..."
                />
              ) : (
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Коротко о главном..."
                  className="rounded-xl h-12"
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label>Награда (XP)</Label>
              <div className="grid grid-cols-4 gap-2">
                {["10", "25", "50", "100"].map((val) => (
                  <Button
                    key={val}
                    type="button"
                    variant={xpReward === val ? "default" : "outline"}
                    className="rounded-xl h-10 shadow-none border-slate-200 font-bold"
                    onClick={() => setXpReward(val)}
                  >
                    {val}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Тип квеста</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={type === QuestType.ONE_TIME ? "default" : "outline"}
                  className="flex-1 rounded-xl"
                  onClick={() => setType(QuestType.ONE_TIME)}
                >
                  <Target className="w-4 h-4 mr-2" />
                  Разовый
                </Button>
                <Button
                  type="button"
                  variant={type === QuestType.DAILY ? "default" : "outline"}
                  className="flex-1 rounded-xl"
                  onClick={() => setType(QuestType.DAILY)}
                >
                  <Repeat className="w-4 h-4 mr-2" />
                  Повтор
                </Button>
              </div>
            </div>

            {type === QuestType.DAILY && (
              <div className="grid gap-2">
                <Label>Дни недели</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={cn(
                        "w-9 h-9 rounded-lg text-xs font-bold transition-all",
                        recurringDays.includes(day.value) 
                          ? "bg-blue-600 text-white" 
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      )}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-2 border-t pt-4">
              <Label htmlFor="deadline" className="flex items-center gap-2">
                Дедлайн <span className="text-[10px] text-slate-400 font-normal">(необязательно)</span>
              </Label>
              <Input
                id="deadline"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="rounded-xl"
              />
            </div>

            {deadline && (
              <div className="grid gap-4 bg-slate-50 p-3 rounded-2xl animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-blue-600" />
                  <Label>Уведомить за (минут)</Label>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {["5", "15", "30", "60"].map((val) => (
                    <Button
                      key={val}
                      type="button"
                      variant={notifyAdvance === val ? "secondary" : "outline"}
                      className={cn(
                        "rounded-xl h-9 text-xs font-bold shadow-none",
                        notifyAdvance === val ? "bg-blue-100 text-blue-600 border-transparent" : "bg-white border-slate-200"
                      )}
                      onClick={() => setNotifyAdvance(val)}
                    >
                      {val}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 text-lg font-bold">
              {loading ? "Создаем..." : "Создать квест"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
