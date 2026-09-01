/*
 * VEXCollab - room lifecycle for React.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { CollabProvider, type Peer } from './provider';
import { loadIdentity } from './identity';
import { ensureStarterFiles, getFiles, listPaths } from './project';

export interface CollabState {
  provider: CollabProvider | null;
  doc: Y.Doc | null;
  connected: boolean;
  peers: Peer[];
  paths: string[];
}

export function useCollab(roomId: string): CollabState {
  const [provider, setProvider] = useState<CollabProvider | null>(null);
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [paths, setPaths] = useState<string[]>([]);

  useEffect(() => {
    const instance = new CollabProvider(roomId, loadIdentity());
    setProvider(instance);

    const offConnection = instance.onConnectionChange(setConnected);
    const offPeers = instance.onPeers(setPeers);

    const files = getFiles(instance.doc);
    const syncPaths = () => setPaths(listPaths(instance.doc));
    files.observe(syncPaths);

    // Seed only after the server has handed us the existing document, so we
    // never overwrite a room that already has files.
    const offSynced = instance.onSynced(() => {
      ensureStarterFiles(instance.doc);
      syncPaths();
    });

    syncPaths();

    return () => {
      offConnection();
      offPeers();
      offSynced();
      files.unobserve(syncPaths);
      instance.destroy();
      setProvider(null);
    };
  }, [roomId]);

  return { provider, doc: provider?.doc ?? null, connected, peers, paths };
}
