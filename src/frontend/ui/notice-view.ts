// Notice of a screen (Gestão and PDV): an error is red with role alert, a confirmation is green and
// any other notice is blue; the last two use role status so a screen reader does not interrupt.
export type NoticeData = { text: string; isError?: boolean; isSuccess?: boolean };

export function noticeView(notice: NoticeData): { className: 'error' | 'success' | 'notice'; role: 'alert' | 'status' } {
  if (notice.isError) return { className: 'error', role: 'alert' };
  if (notice.isSuccess) return { className: 'success', role: 'status' };
  return { className: 'notice', role: 'status' };
}
