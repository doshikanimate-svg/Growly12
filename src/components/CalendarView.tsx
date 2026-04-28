import { useState, useMemo, useEffect } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  parseISO,
  isToday,
  addDays,
  subDays,
  set,
  startOfDay,
  endOfDay
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Clock, Target, CalendarDays, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Quest, QuestStatus } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import CreateQuestDialog from "./CreateQuestDialog";

interface CalendarViewProps {
  quests: Quest[];
}

type ViewType = 'month' | 'day';

export default function CalendarView({ quests }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>('month');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedDateStamp, setSelectedDateStamp] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const next = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };
  
  const prev = () => {
    if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const questsByDay = useMemo(() => {
    const map: Record<string, Quest[]> = {};
    quests.forEach(quest => {
      if (quest.deadline && quest.status === QuestStatus.ACTIVE) {
        const dateKey = format(parseISO(quest.deadline), 'yyyy-MM-dd');
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(quest);
      }
    });
    return map;
  }, [quests]);

  const handleDayClick = (day: Date, hour?: number) => {
    const now = new Date();
    const targetHour = hour !== undefined ? hour : (day.getDate() === now.getDate() && day.getMonth() === now.getMonth() ? now.getHours() + 1 : 12);
    
    const defaultTime = set(day, { 
      hours: targetHour, 
      minutes: 0 
    });
    setSelectedDateStamp(format(defaultTime, "yyyy-MM-dd'T'HH:mm"));
    setIsAddOpen(true);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-sm rounded-[2.5rem] bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="p-6 flex flex-col sm:flex-row items-center justify-between border-b border-slate-50 gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-black text-slate-800 capitalize min-w-[150px]">
                {view === 'month' 
                  ? format(currentDate, 'LLLL yyyy', { locale: ru })
                  : format(currentDate, 'd MMMM yyyy', { locale: ru })
                }
              </h2>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase transition-all ${view === 'month' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                  onClick={() => setView('month')}
                >
                  <CalendarDays className="w-3 h-3 mr-1" />
                  Месяц
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase transition-all ${view === 'day' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                  onClick={() => setView('day')}
                >
                  <Clock className="w-3 h-3 mr-1" />
                  День
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={prev} className="rounded-xl hover:bg-slate-50">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button variant="ghost" className="text-[10px] font-black uppercase px-3 h-10 hover:bg-slate-50 border-none shadow-none" onClick={() => setCurrentDate(new Date())}>
                СЕГОДНЯ
              </Button>
              <Button variant="ghost" size="icon" onClick={next} className="rounded-xl hover:bg-slate-50">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {view === 'month' ? (
            <>
              <div className="grid grid-cols-7 border-b border-slate-50">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                  <div key={day} className="py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {days.map((day, idx) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const dayQuests = questsByDay[dateKey] || [];
                  const isCurMonth = isSameMonth(day, currentDate);
                  const isSelected = isToday(day);

                  return (
                    <div 
                      key={idx} 
                      onClick={() => handleDayClick(day)}
                      className={`min-h-[100px] p-2 border-r border-b border-slate-50 relative cursor-pointer hover:bg-blue-50/30 transition-colors group ${
                        isCurMonth ? "bg-white" : "bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-black rounded-lg w-7 h-7 flex items-center justify-center transition-colors ${
                          isSelected ? "bg-blue-600 text-white shadow-md shadow-blue-200" : isCurMonth ? "text-slate-700" : "text-slate-300"
                        }`}>
                          {format(day, 'd')}
                        </span>
                        <Plus className="w-3 h-3 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      
                      <div className="space-y-1 overflow-hidden">
                        {dayQuests.slice(0, 3).map(quest => (
                          <div key={quest.id} className="bg-blue-50 text-blue-700 p-1 rounded-md text-[9px] font-bold leading-tight truncate flex items-center gap-1">
                            <div className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                            {quest.title}
                          </div>
                        ))}
                        {dayQuests.length > 3 && (
                          <div className="text-[9px] font-black text-slate-400 pl-1 uppercase">
                            +{dayQuests.length - 3} ещё
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="relative overflow-y-auto max-h-[600px] scrollbar-hide">
              {/* Day Timeline */}
              <div className="relative pt-4 pb-20 px-4">
                {hours.map(hour => {
                  const dateKey = format(currentDate, 'yyyy-MM-dd');
                  const hourQuests = (questsByDay[dateKey] || []).filter(q => {
                    const qDate = parseISO(q.deadline!);
                    return qDate.getHours() === hour;
                  });

                  return (
                    <div key={hour} className="group relative flex border-t border-slate-50 min-h-[60px]">
                      <div className="w-16 pr-4 text-right">
                        <span className="text-[10px] font-black text-slate-400">
                          {hour.toString().padStart(2, '0')}:00
                        </span>
                      </div>
                      <div 
                        className="flex-1 py-1 relative hover:bg-slate-50/50 transition-colors cursor-crosshair rounded-lg"
                        onClick={() => handleDayClick(currentDate, hour)}
                      >
                        <div className="flex flex-wrap gap-2">
                          {hourQuests.map(quest => (
                            <div 
                              key={quest.id} 
                              className="bg-blue-600 text-white p-3 rounded-2xl shadow-lg shadow-blue-200/50 min-w-[200px] max-w-full animate-in zoom-in-95 duration-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Optional: Open edit dialog here
                              }}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[8px] font-black uppercase text-blue-200 tracking-tighter">
                                  {format(parseISO(quest.deadline!), 'HH:mm')}
                                </span>
                                <Badge className="bg-white/20 hover:bg-white/30 text-white border-none text-[8px] font-black py-0 px-1">
                                  {quest.xpReward} XP
                                </Badge>
                              </div>
                              <h4 className="text-xs font-black leading-tight line-clamp-2">{quest.title}</h4>
                            </div>
                          ))}
                        </div>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus className="w-4 h-4 text-blue-400" />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Current Time Indicator */}
                {isToday(currentDate) && (
                  <div 
                    className="absolute left-0 right-0 z-10 border-t-2 border-red-500 flex items-center gap-2 pointer-events-none transition-all duration-1000"
                    style={{ 
                      top: `${((currentTime.getHours() * 60 + currentTime.getMinutes()) / (24 * 60)) * (24 * 60)}px`,
                      marginTop: '16px', // Offset for padding top
                      transform: `translateY(${currentTime.getHours() * 60 + currentTime.getMinutes()}px)`
                    }}
                  >
                    <div className="bg-red-500 h-3 w-3 rounded-full -ml-1.5 shadow-md shadow-red-200" />
                    <div className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm">
                      {format(currentTime, 'HH:mm')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Day Agenda (Visible only in month view for secondary info) */}
      {view === 'month' && (
        <div className="space-y-4">
           <h3 className="font-extrabold text-slate-800 px-2 flex items-center gap-2">
             <Clock className="w-4 h-4 text-blue-600" />
             Ближайшие события
           </h3>
           
           <div className="grid gap-3">
              {quests
                .filter(q => q.deadline && q.status === QuestStatus.ACTIVE)
                .sort((a, b) => parseISO(a.deadline!).getTime() - parseISO(b.deadline!).getTime())
                .slice(0, 5)
                .map(quest => (
                  <Card key={quest.id} className="border-none shadow-sm rounded-2xl bg-white overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-blue-50 rounded-xl shrink-0">
                          <Target className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-black text-slate-800 text-sm truncate">{quest.title}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">
                            {format(parseISO(quest.deadline!), 'd MMM, HH:mm', { locale: ru })}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="rounded-full border-blue-100 text-blue-600 font-black text-[9px]">
                        {quest.xpReward} XP
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              
              {quests.filter(q => q.deadline && q.status === QuestStatus.ACTIVE).length === 0 && (
                <div className="text-center py-10 bg-white rounded-3xl border-2 border-dashed border-slate-100 italic text-slate-400 text-sm">
                  Нет запланированных квестов
                </div>
              )}
           </div>
        </div>
      )}

      <CreateQuestDialog 
        onCreated={() => {}} 
        initialDeadline={selectedDateStamp} 
        open={isAddOpen} 
        onOpenChange={setIsAddOpen} 
      />
    </div>
  );
}
