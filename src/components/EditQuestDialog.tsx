import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useState, useEffect } from "react";
import { Quest, QuestType, QuestStatus } from "@/types";
import { Target, Repeat, Bell, Trash2, Save, FileText, AlignLeft } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
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

interface EditQuestDialogProps {
  quest: Quest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditQuestDialog({ quest, open, onOpenChange }: EditQuestDialogProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [xpReward, setXpReward] = useState("50");
  const [type, setType] = useState<QuestType>(QuestType.ONE_TIME);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [deadline, setDeadline] = useState("");
  const [notifyAdvance, setNotifyAdvance] = useState("30");
  const [showRichEditor, setShowRichEditor] = useState(false);

  useEffect(() => {
    if (quest) {
      setTitle(quest.title);
      setDescription(quest.description || "");
      // Auto-enable rich editor if content looks like HTML
      if (quest.description && /<[a-z][\s\S]*>/i.test(quest.description)) {
        setShowRichEditor(true);
      }
      setXpReward(quest.xpReward.toString());
      setType(quest.type);
      setRecurringDays(quest.recurringDays || []);
      if (quest.deadline) {
        const d = new Date(quest.deadline);
        setDeadline(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
      } else {
        setDeadline("");
      }
      setNotifyAdvance((quest.notifyAdvance || 30).toString());
    }
  }, [quest]);

  const toggleDay = (day: number) => {
    setRecurringDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !quest) return;

    if (type === QuestType.DAILY && recurringDays.length === 0) {
      toast.error("Выберите хотя бы один день для повторения");
      return;
    }

    setLoading(true);
    const path = `users/${auth.currentUser.uid}/quests/${quest.id}`;

    try {
      await updateDoc(doc(db, `users/${auth.currentUser.uid}/quests`, quest.id), {
        title,
        description,
        xpReward: parseInt(xpReward),
        type,
        recurringDays: type === QuestType.DAILY ? recurringDays : [],
        deadline: deadline ? new Date(deadline).toISOString() : null,
        localTime: deadline ? deadline.split("T")[1] : null,
        notifyAdvance: deadline ? parseInt(notifyAdvance) : null,
        notified: false,
        updatedAt: new Date().toISOString(),
      });
      toast.success("Квест обновлен");
      onOpenChange(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!auth.currentUser || !quest) return;

    setDeleting(true);
    const path = `users/${auth.currentUser.uid}/quests/${quest.id}`;

    try {
      await deleteDoc(doc(db, `users/${auth.currentUser.uid}/quests`, quest.id));
      toast.success("Квест удален");
      onOpenChange(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-3xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Редактировать Квест</DialogTitle>
            <DialogDescription>
              Измените параметры вашего испытания.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Название</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Название квеста"
                required
                className="rounded-xl"
              />
            </div>
            
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-description">Описание</Label>
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
                  id="edit-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Что нужно сделать?"
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
              <Label>Режим</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={type === QuestType.ONE_TIME ? "default" : "outline"}
                  className="flex-1 rounded-xl h-10 shadow-none border-slate-200"
                  onClick={() => setType(QuestType.ONE_TIME)}
                >
                  <Target className="w-4 h-4 mr-2" />
                  Разовый
                </Button>
                <Button
                  type="button"
                  variant={type === QuestType.DAILY ? "default" : "outline"}
                  className="flex-1 rounded-xl h-10 shadow-none border-slate-200"
                  onClick={() => setType(QuestType.DAILY)}
                >
                  <Repeat className="w-4 h-4 mr-2" />
                  Повтор
                </Button>
              </div>
            </div>

            {type === QuestType.DAILY && (
              <div className="grid gap-2">
                <Label>Дни повторения</Label>
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
              <Label htmlFor="edit-deadline" className="flex items-center gap-2">
                Дедлайн
              </Label>
              <Input
                id="edit-deadline"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="rounded-xl"
              />
            </div>

            {deadline && (
              <div className="grid gap-4 bg-slate-50 p-3 rounded-2xl">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-blue-600" />
                  <Label>Уведомить за (мин)</Label>
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
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button 
                    type="button" 
                    variant="destructive" 
                    className="flex-1 rounded-xl h-12 font-bold bg-red-50 text-red-600 hover:bg-red-100 shadow-none border-none"
                    disabled={deleting || loading}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Удалить
                  </Button>
                }
              />
              <AlertDialogContent className="rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Это действие нельзя отменить. Квест будет навсегда удален из вашей книги приключений.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-xl"
                  >
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button 
              type="submit" 
              disabled={loading || deleting} 
              className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 text-lg font-bold"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Сохраняем..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
