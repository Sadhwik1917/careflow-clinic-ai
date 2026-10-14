import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/navigation";
import {
  NOTIFICATION_COLUMNS, NOTIFICATION_LIMIT, POLL_MS, markRead, mergeNotification, notificationTarget, notificationsKey,
  timeLabel, unreadCount, type NotificationRow,
} from "@/lib/notifications";

export function notificationsQuery(userId: string, live: boolean) {
  return {
    queryKey: notificationsKey(userId),
    queryFn: async (): Promise<NotificationRow[]> => {
      // Explicit recipient filter: admins' RLS can read all rows, but the bell shows only their own.
      const { data, error } = await supabase.from("notifications").select(NOTIFICATION_COLUMNS)
        .eq("recipient_user_id", userId).order("created_at", { ascending: false }).limit(NOTIFICATION_LIMIT);
      if (error) throw new Error("notifications");
      return (data ?? []) as NotificationRow[];
    },
    refetchInterval: live ? false as const : POLL_MS,
    staleTime: 30_000,
  };
}

export function NotificationBell({ userId, role }: { userId: string; role: AppRole }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(false);
  const q = useQuery(notificationsQuery(userId, live));

  useEffect(() => {
    const channel = supabase.channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${userId}` }, payload => {
        qc.setQueryData<NotificationRow[]>(notificationsKey(userId), list => mergeNotification(list ?? [], payload.new as NotificationRow));
      })
      .subscribe(status => {
        const ok = status === "SUBSCRIBED";
        setLive(ok);
        // After (re)connecting, refetch once to catch anything missed while disconnected; merge dedupes by id.
        if (ok) void qc.invalidateQueries({ queryKey: notificationsKey(userId) });
      });
    return () => { void supabase.removeChannel(channel); };
  }, [userId, qc]);

  const list = q.data ?? [];
  const unread = unreadCount(list);

  async function openItem(n: NotificationRow) {
    if (!n.is_read) {
      qc.setQueryData<NotificationRow[]>(notificationsKey(userId), l => markRead(l ?? [], n.id));
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", n.id).eq("recipient_user_id", userId);
      if (error) void qc.invalidateQueries({ queryKey: notificationsKey(userId) });
    }
    const to = notificationTarget(n, role);
    if (to) { setOpen(false); void navigate({ to }); }
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
        <Bell />
        {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-5 text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
      <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">Notifications</h2>{unread > 0 && <span className="text-xs text-muted-foreground">{unread} unread</span>}</div>
      {q.isPending ? <p className="px-4 py-6 text-sm text-muted-foreground">Loading notifications…</p>
        : q.isError ? <div className="space-y-2 px-4 py-6 text-sm"><p>Notifications couldn't load.</p><Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button></div>
        : list.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">You're all caught up.</p>
        : <ScrollArea className="max-h-96"><ul className="divide-y">{list.map(n => <li key={n.id}>
          <button type="button" onClick={() => void openItem(n)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
            <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-primary"}`} />
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${n.is_read ? "" : "font-semibold"}`}>{n.title}<span className="sr-only">{n.is_read ? " (read)" : " (unread)"}</span></span>
              <span className="mt-0.5 block break-words text-xs text-muted-foreground">{n.message}</span>
              <span className="mt-1 block text-[11px] text-muted-foreground">{timeLabel(n.created_at)}</span>
            </span>
          </button>
        </li>)}</ul></ScrollArea>}
    </PopoverContent>
  </Popover>;
}
