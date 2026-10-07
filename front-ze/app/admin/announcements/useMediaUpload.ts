'use client';

import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AnnouncementMedia } from 'types/announcements';
import { insertBlock, replaceInTextarea } from './markdownEditing';

const MB = 1024 * 1024;
const LIMITS: Record<string, number> = {
  'image/png': 15 * MB,
  'image/jpeg': 15 * MB,
  'image/webp': 15 * MB,
  'image/gif': 15 * MB,
  'video/mp4': 50 * MB,
  'video/webm': 50 * MB,
};

export const MEDIA_ACCEPT = Object.keys(LIMITS).join(',');

export const UPLOAD_PLACEHOLDER_PREFIX = '#upload-';

function altText(file: File) {
  return file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '').trim() || 'media';
}

async function uploadFile(file: File): Promise<AnnouncementMedia> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch('/api/admin/announcements/media', { method: 'POST', body });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.msg !== 'OK') {
    throw new Error(json?.msg || `Upload failed (${response.status})`);
  }
  return json.data as AnnouncementMedia;
}

export function useMediaUpload(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  setContent: Dispatch<SetStateAction<string>>,
) {
  const [pending, setPending] = useState(0);

  const replace = (search: string, replacement: string) => {
    const el = textareaRef.current;
    if (el && replaceInTextarea(el, search, replacement)) return;
    setContent((current) => current.replace(search, replacement));
  };

  const upload = (files: File[]) => {
    const accepted = files.filter((file) => {
      const limit = LIMITS[file.type];
      if (!limit) {
        toast.error(`${file.name}: unsupported file type`, {
          description: 'Use PNG, JPEG, WebP, GIF, MP4 or WebM.',
        });
        return false;
      }
      if (file.size > limit) {
        toast.error(`${file.name} is too large`, { description: `The limit is ${limit / MB} MB.` });
        return false;
      }
      return true;
    });
    const el = textareaRef.current;
    if (accepted.length === 0 || !el) return;

    const jobs = accepted.map((file) => ({
      file,
      placeholder: `![Uploading ${altText(file)}…](${UPLOAD_PLACEHOLDER_PREFIX}${crypto.randomUUID().slice(0, 8)})`,
    }));
    insertBlock(el, jobs.map((job) => job.placeholder).join('\n\n'));

    setPending((count) => count + jobs.length);
    for (const { file, placeholder } of jobs) {
      uploadFile(file)
        .then((media) => replace(placeholder, `![${altText(file)}](${media.url})`))
        .catch((error: Error) => {
          replace(placeholder, '');
          toast.error(`Failed to upload ${file.name}`, { description: error.message });
        })
        .finally(() => setPending((count) => count - 1));
    }
  };

  return { upload, uploading: pending > 0 };
}
