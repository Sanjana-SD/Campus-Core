import React, { useState } from 'react';
import { ApiClient } from '../../lib/api';
import { errorMessage } from '../../lib/utils';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/Kit';
import { TextArea } from './placementShared';
import { ALLOWED_TRANSITIONS, Drive, TRANSITION_COPY, label, transitionLabel } from './placementUtils';

export const DriveStatusModal: React.FC<{
  drive: Drive | null;
  onClose: () => void;
  onDone: (d: Drive) => void;
}> = ({ drive, onClose, onDone }) => {
  const options = drive ? ALLOWED_TRANSITIONS[drive.status] ?? [] : [];
  // Parents mount this with key={drive.id} so state resets per drive.
  const [target, setTarget] = useState(options[0] ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!drive) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (target === 'CANCELLED' && !reason.trim()) {
      setError('A reason is required to cancel a drive.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const d = await ApiClient.post<Drive>(`/placements/drives/${drive.id}/status`, {
        status: target,
        reason: reason.trim() || null,
      });
      onDone(d);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Change drive status" description={`${drive.company?.name ?? ''} – ${drive.job_title}`}>
      {options.length === 0 ? (
        <p className="text-sm text-slate-600">
          A {label(drive.status).toLowerCase()} drive cannot change status.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <ErrorState title="Status not changed" message={error} />}
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-700 mb-1">New status</legend>
            {options.map((o) => (
              <label
                key={o}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                  target === o ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="drive-status"
                  value={o}
                  checked={target === o}
                  onChange={() => setTarget(o)}
                  className="mt-0.5 accent-blue-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{transitionLabel(o)}</span>
                  <span className="block text-xs text-slate-500">{TRANSITION_COPY[o]?.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <TextArea
            label={target === 'CANCELLED' ? 'Reason (required, sent to applicants)' : 'Reason (optional, kept in the audit log)'}
            name="status-reason"
            required={target === 'CANCELLED'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Close
            </Button>
            <Button type="submit" variant={target === 'CANCELLED' ? 'danger' : 'primary'} isLoading={saving} disabled={!target}>
              {transitionLabel(target)}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
