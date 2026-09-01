import { Workspace } from '@/components/Workspace';

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <Workspace roomId={decodeURIComponent(roomId)} />;
}
