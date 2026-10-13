import dayjs from 'dayjs';

export function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return dayjs(dateString).format('MMM D, YYYY h:mm A');
}

export function formatReasonLabel(reason: string): string {
  if (reason === 'video_unavailable') return 'Video Unavailable';
  if (reason === 'wrong_video') return 'Wrong Video';
  return reason;
}
