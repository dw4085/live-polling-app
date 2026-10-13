import { useEffect, useState } from 'react';
import { getOutboxStatus, sendOutboxNow, type OutboxStatus } from '../../services/api';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

// Students' answers reported to the class hub's activity log that it hasn't received yet, with "Send now".
export function HubOutboxPanel() {
  const [status, setStatus] = useState<OutboxStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    getOutboxStatus()
      .then(setStatus)
      .catch((error) => console.error('Failed to load hub report status:', error));
  }, []);

  const sendNow = async () => {
    setSending(true);
    setNote(null);
    try {
      const data = await sendOutboxNow();
      setStatus(data.status);
      setNote(data.status.waiting === 0
        ? `Sent ${data.delivered}. Everything has reached the class hub.`
        : `Sent ${data.delivered}; ${data.status.waiting} still waiting.`);
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (!status) return null;
  const ok = status.waiting === 0 && status.failed === 0;
  return (
    <div className={`rounded-xl p-4 mb-6 border ${ok ? 'border-gray-200 bg-white' : 'border-yellow-300 bg-yellow-50'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Class hub activity</p>
          {status.waiting > 0 ? (
            <p className="font-semibold text-yellow-800">
              {status.waiting} activity report{status.waiting === 1 ? '' : 's'} waiting to be sent
              <span className="font-normal text-gray-500"> · oldest {when(status.oldestWaitingAt)}</span>
            </p>
          ) : (
            <p className="font-semibold text-gray-800">
              All activity has reached the class hub
              {status.lastDeliveredAt && <span className="font-normal text-gray-500"> · last sent {when(status.lastDeliveredAt)}</span>}
            </p>
          )}
          {status.failed > 0 && (
            <p className="text-sm text-red-600">
              {status.failed} report{status.failed === 1 ? ' was' : 's were'} rejected by the hub and won't be resent.
            </p>
          )}
          {status.waiting > 0 && status.lastError && <p className="text-xs text-gray-500 mt-1">Last error: {status.lastError}</p>}
          {note && <p className="text-sm text-gray-700 mt-1">{note}</p>}
        </div>
        {status.waiting > 0 && (
          <button
            onClick={sendNow}
            disabled={sending}
            className="px-4 py-2 bg-navy text-white rounded-lg font-medium hover:bg-navy-light transition-colors disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send now'}
          </button>
        )}
      </div>
    </div>
  );
}
