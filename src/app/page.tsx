import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TimelineView } from "@/components/timeline/timeline-view";

export default async function Home() {
  // 检查登录状态
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }
  } catch {
    redirect("/login");
  }

  return <TimelineView />;
}
