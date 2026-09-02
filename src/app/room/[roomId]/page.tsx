import { Workspace } from '@/components/Workspace';

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ t?: string; repo?: string }>;
}) {
  const { roomId } = await params;
  const { t, repo } = await searchParams;

  // Read on the server so the template is known before the room is seeded —
  // reading it on the client would race the first render.
  return <Workspace roomId={decodeURIComponent(roomId)} template={t ?? null} repo={repo ?? null} />;
}
