import React, { useState, useEffect } from 'react';
import { Bell, Plus, CheckCircle2, User, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const AnnouncementsPage: React.FC = () => {
  const { role } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Post modal for admin and lecturer
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    target_role: 'ALL',
    priority: 'NORMAL',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any[]>('/announcements');
      setAnnouncements(res || []);
    } catch (err) {
      console.error('Error fetching announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await ApiClient.post('/announcements', formData);
      setIsOpen(false);
      setFormData({ title: '', content: '', target_role: 'ALL', priority: 'NORMAL' });
      fetchAnnouncements();
    } catch (err: any) {
      alert(err.message || 'Error posting notice');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Campus Notices & Announcements</h1>
          <p className="text-xs text-slate-500 mt-1">
            Official communications, academic schedules, and institutional notices.
          </p>
        </div>
        {(role === 'ADMIN' || role === 'LECTURER') && (
          <Button variant="primary" size="sm" onClick={() => setIsOpen(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
            Post Announcement
          </Button>
        )}
      </div>

      {loading ? (
        <LoadingSpinner message="Fetching campus bulletins..." />
      ) : announcements.length === 0 ? (
        <Card className="text-center p-12">
          <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-800">No Announcements Active</h3>
          <p className="text-xs text-slate-500 mt-1">Check back for updates from the dean or faculty.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <Card key={ann.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    ann.priority === 'URGENT' ? 'bg-rose-100 text-rose-800' : 'bg-blue-50 text-blue-800'
                  }`}>
                    {ann.priority} Notice
                  </span>
                  <span className="text-[11px] text-slate-400">
                    For: {ann.target_role}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {new Date(ann.created_at).toLocaleDateString()}
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-900">{ann.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{ann.content}</p>

              <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-100 flex items-center gap-1.5">
                <User className="w-3 h-3 text-slate-400" />
                <span>Posted by {ann.author_name || 'Academic Administrator'}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* POST ANNOUNCEMENT MODAL */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Broadcast Campus Announcement">
        <form onSubmit={handlePost} className="space-y-4">
          <Input
            label="Announcement Title"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g. Schedule for Mid-Term Lab Submissions"
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Audience"
              value={formData.target_role}
              onChange={(e) => setFormData({ ...formData, target_role: e.target.value })}
              options={[
                { label: 'Everyone (All Users)', value: 'ALL' },
                { label: 'Students Only', value: 'STUDENT' },
                { label: 'Faculty / Lecturers Only', value: 'LECTURER' },
              ]}
            />
            <Select
              label="Priority"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              options={[
                { label: 'Normal Priority', value: 'NORMAL' },
                { label: 'Urgent Alert', value: 'URGENT' },
              ]}
            />
          </div>

          <div className="space-y-1 text-left">
            <label className="block text-xs font-medium text-slate-700">Notice Body</label>
            <textarea
              required
              rows={4}
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="State announcement details and instructions clearly..."
              className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Broadcast Notice
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
