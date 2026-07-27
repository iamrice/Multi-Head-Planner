import { TimelineView } from "@/components/timeline/timeline-view";

export default async function Home() {
  // 不再强制登录检查，允许未登录用户使用（本地缓存模式）
  return <TimelineView />;
}
