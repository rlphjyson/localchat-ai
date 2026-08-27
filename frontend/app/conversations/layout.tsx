"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteConversation, listConversations, type Conversation } from "@/lib/api";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { TopBar } from "@/components/TopBar";

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Refetches on every route change within /conversations, not just on mount -- navigating to a
  // newly-created conversation's own page is what picks up that new conversation in the sidebar.
  useEffect(() => {
    listConversations().then((fetched) => {
      setConversations(fetched);
      setLoaded(true);
    });
  }, [pathname]);

  async function handleDelete(id: string) {
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (pathname === `/conversations/${id}`) router.push("/conversations");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <ConversationSidebar conversations={conversations} loaded={loaded} onDelete={handleDelete} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
