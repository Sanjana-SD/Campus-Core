import React, { useState, useEffect } from 'react';
import { ClipboardList, Send, CheckCircle2, FileText, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiClient } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const StudentAssignments: React.FC = () => {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Submit Modal
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [selectedAsg, setSelectedAsg] = useState<any>(null);
  const [textContent, setTextContent] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any[]>('/assignments');
      setAssignments(res || []);
    } catch (err) {
      console.error('Error fetching assignments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const openSubmitModal = (asg: any) => {
    setSelectedAsg(asg);
    setTextContent('');
    setFileUrl('');
    setIsSubmitOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsg) return;
    setIsSubmitting(true);
    try {
      await ApiClient.post(`/assignments/${selectedAsg.id}/submit`, {
        text_content: textContent,
        file_url: fileUrl,
      });
      setIsSubmitOpen(false);
      setSuccessMsg(`Successfully submitted coursework for ${selectedAsg.title}!`);
    } catch (err: any) {
      alert(err.message || 'Error submitting assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link to="/student" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Coursework & Assignments</h1>
        <p className="text-xs text-slate-500 mt-1">
          Review problem sets, upload your work, and view faculty marks and feedback.
        </p>
      </div>

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs text-emerald-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <LoadingSpinner message="Fetching coursework tasks..." />
      ) : assignments.length === 0 ? (
        <Card className="text-center p-12">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-800">No Assignments Currently Active</h3>
          <p className="text-xs text-slate-500 mt-1">
            Check back later for newly assigned problems from your instructors.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assignments.map((asg) => (
            <Card key={asg.id} className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {asg.subject?.code} - {asg.subject?.name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Due: {new Date(asg.due_date).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-2">{asg.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap mb-4">
                  {asg.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Max Score: {asg.max_marks} pts</span>
                <Button variant="primary" size="sm" onClick={() => openSubmitModal(asg)}>
                  Submit Solution
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* SUBMISSION MODAL */}
      <Modal
        isOpen={isSubmitOpen}
        onClose={() => setIsSubmitOpen(false)}
        title={`Submit Solution: ${selectedAsg?.title}`}
        description="Enter your response, code snippet, or Google Drive / GitHub link below."
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1 text-left">
            <label className="block text-xs font-medium text-slate-700">Written Response / Explanation</label>
            <textarea
              required
              rows={5}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Provide your solution analysis, query statements, or implementation notes..."
              className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
            />
          </div>

          <Input
            label="External File / Repository Link (Optional)"
            type="url"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="https://github.com/student/assignment or Google Drive URL"
          />

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsSubmitOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Confirm Submission
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
