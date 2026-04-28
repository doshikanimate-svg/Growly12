import { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format, subDays, startOfWeek, startOfMonth, isWithinInterval, parseISO, eachDayOfInterval } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";

interface XPHistoryItem {
  xpGained: number;
  timestamp: string;
}

interface XPProgressionChartProps {
  history: XPHistoryItem[];
}

type Period = 'week' | 'month' | 'all';

export default function XPProgressionChart({ history }: XPProgressionChartProps) {
  const [period, setPeriod] = useState<Period>('week');

  const chartData = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    if (period === 'week') {
      startDate = startOfWeek(now, { weekStartsOn: 1 });
    } else if (period === 'month') {
      startDate = startOfMonth(now);
    } else {
      // For "all", we find the earliest date in history or default to 30 days ago
      if (history.length > 0) {
        startDate = history.reduce((earliest, item) => {
          const itemDate = parseISO(item.timestamp);
          return itemDate < earliest ? itemDate : earliest;
        }, parseISO(history[0].timestamp));
      } else {
        startDate = subDays(now, 30);
      }
    }

    const interval = { start: startDate, end: now };
    const days = eachDayOfInterval(interval);

    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dailyXP = history
        .filter(item => format(parseISO(item.timestamp), 'yyyy-MM-dd') === dayStr)
        .reduce((sum, item) => sum + item.xpGained, 0);

      return {
        date: day,
        displayDate: format(day, period === 'week' ? 'EEEEEE' : 'd MMM', { locale: ru }),
        xp: dailyXP,
        fullDate: format(day, 'd MMMM yyyy', { locale: ru })
      };
    });
  }, [history, period]);

  const totalXP = chartData.reduce((sum, d) => sum + d.xp, 0);

  return (
    <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              Прогресс опыта
            </CardTitle>
            <CardDescription>
              Набрано {totalXP} XP за выбранный период
            </CardDescription>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(['week', 'month', 'all'] as const).map((p) => (
              <Button
                key={p}
                variant="ghost"
                size="sm"
                className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-tighter ${
                  period === p ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => setPeriod(p)}
              >
                {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Все'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="displayDate" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                dy={10}
              />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 text-white p-2 rounded-xl text-[10px] font-bold shadow-xl border border-white/10">
                        <p className="opacity-70 mb-1">{payload[0].payload.fullDate}</p>
                        <p className="text-sm">+{payload[0].value} XP</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                dataKey="xp" 
                radius={[6, 6, 6, 6]}
                barSize={period === 'week' ? 24 : 12}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.xp > 0 ? '#3b82f6' : '#f1f5f9'}
                    className="transition-all duration-300"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
