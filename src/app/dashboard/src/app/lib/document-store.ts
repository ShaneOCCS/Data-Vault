'use client';

/**
 * A tiny localStorage-backed mock "documents" table.
 * Admins upload files (encoded as base64 data URLs) against a KIT ID;
 * that KIT ID's owner can then see and download them from their dashboard.
 *
 * NOTE: this stores file bytes as base64 text in localStorage, which has a
 * small quota (usually ~5MB total per origin). Fine for a prototype/demo —
 * swap for real file storage (e.g. Firebase Storage) before going to
 * production or handling large/many files.
 */

export interface VaultDocument {
  id: string;
  kitId: string;
  fileName: string;
  fileType: string;
  size: number; // bytes
  dataUrl: string; // base64 data URL
  uploadedAt: string; // ISO timestamp
}

import { remoteRead, remoteWrite } from './remote-kv';

const STORAGE_KEY = 'data_vault_documents';
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (stored on the server now, no browser quota)

async function readAll(): Promise<VaultDocument[]> {
  return remoteRead<VaultDocument[]>(STORAGE_KEY, []);
}

async function writeAll(docs: VaultDocument[]): Promise<void> {
  await remoteWrite(STORAGE_KEY, docs);
}

const tick = () => new Promise((res) => setTimeout(res, 300));

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadDocument(kitId: string, file: File): Promise<{ ok: boolean; error?: string }> {
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: 'Please choose a file under 3MB.' };
  }
  try {
    const dataUrl = await fileToDataUrl(file);
    await tick();
    const docs = await readAll();
    docs.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kitId: kitId.toUpperCase(),
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      size: file.size,
      dataUrl,
      uploadedAt: new Date().toISOString(),
    });
    await writeAll(docs);
    return { ok: true };
  } catch {
    return { ok: false, error: "Please try again — we couldn't read that file." };
  }
}

export async function getDocumentsForKit(kitId: string): Promise<VaultDocument[]> {
  await tick();
  return (await readAll())
    .filter((d) => d.kitId === kitId.toUpperCase())
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export async function getAllDocuments(): Promise<VaultDocument[]> {
  await tick();
  return (await readAll()).sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export async function deleteDocument(id: string): Promise<void> {
  await tick();
  await writeAll((await readAll()).filter((d) => d.id !== id));
}
