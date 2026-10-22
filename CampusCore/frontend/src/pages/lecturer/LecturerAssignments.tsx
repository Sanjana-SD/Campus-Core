import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Plus,
  Calendar,
  CheckCircle2,
  FileText,
  User,
  Star,
  Download
} from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const LecturerAssignments: React.FC = () => {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Assignment Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subject_id: '',
    due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    max_marks: 50.0,
    allowed_file_types: 'pdf,sql,zip,txt',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Submissions Modal
  const [isSubmissionsOpen, setIsSubmissionsOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [gradingState, setGradingState] = useState<{ [key: number]: { marks: number; feedback: string } }>({});

  const fetchData = async () => {
    try {
      setLoading(true);
      const [asgRes, subjRes] = await Promise.all([
        ApiClient.get<any[]>('/assignments'),
        ApiClient.get<any[]>('/academic/subjects'),
      ]);
      setAssignments(asgRes || []);
      setSubjects(subjRes || []);
      if (subjRes?.length) setFormData((prev) => ({ ...prev, subject_id: String(subjRes[0].id) }));
    } catch (err) {
      console.error('Error fetching assignments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await ApiClient.post('/assignments', {
        ...formData,
        subject_id: parseInt(formData.subject_id),
        max_marks: parseFloat(String(formData.max_marks)),
      });
      setIsCreateOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to post assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openSubmissions = async (asg: any) => {
    setSelectedAssignment(asg);
    try {
      const subs = await ApiClient.get<any[]>(`/assignments/${asg.id}/submissions`);
      setSubmissions(subs || []);
      const initialGrade: any = {};
      subs.forEach((s) => {
        initialGrade[s.id] = { marks: s.marks_obtained ?? 0, feedback: s.feedback || '' };
      });
      setGradingState(initialGrade);
      setIsSubmissionsOpen(true);
    } catch (err) {
      console.error('Error opening submissions:', err);
    }
  };

  const handleGradeSubmission = async (subId: number) => {
    const grade = gradingState[subId];
    if (!grade) return;
    try {
      await ApiClient.post(`/assignments/submissions/${subId}/grade`, {
        marks_obtained: parseFloat(String(grade.marks)),
        feedback: grade.feedback,
      });
      alert('Grade saved successfully!');
      if (selectedAssignment) openSubmissions(selectedAssignment);
    } catch (err: any) {
      alert(err.message || 'Error saving grade');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Assignments & Submissions</h1>
          <p className="text-xs text-slate-500 mt-1">
            Create coursework assignments, review uploaded student files, and provide graded feedback.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsCreateOpen(true)}
          leftIcon={<Plus className="w-3.5 h-3.5" />}
        >
          Create Assignment
        </Button>
      </div>

      {/* Assignments List */}
      {loading ? (
        <LoadingSpinner message="Fetching assignments catalog..." />
      ) : assignments.length === 0 ? (
        <Card className="text-center p-12">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-800">No Coursework Assignments Posted</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Click "Create Assignment" above to assign problem sets, laboratory write-ups, or project deliverables.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignments.map((asg) => (
            <Card key={asg.id} className="relative flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {asg.subject?.code}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Due: {new Date(asg.due_date).toLocaleDateString()}
                  </span>
                </div>

                <h4 className="text-base font-bold text-slate-900 mb-1">{asg.title}</h4>
                <p className="text-xs text-slate-600 line-clamp-3 mb-4 leading-relaxed">{asg.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Allowed: {asg.allowed_file_types}</span>
                  <span className="font-bold text-slate-800">{asg.max_marks} pts</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openSubmissions(asg)}
                  className="w-full text-xs"
                >
                  Review Student Submissions
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* CREATE ASSIGNMENT MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Post New Course Assignment"
        description="Students enrolled in this subject will receive notification and submission rights."
        maxWidth="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {formError}
            </div>
          )}

          <Input
            label="Assignment Title"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g. Relational Calculus & Schema Normalization"
          />

          <Select
            label="Subject"
            required
            value={formData.subject_id}
            onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
            options={subjects.map((s) => ({ label: `${s.code} - ${s.name}`, value: s.id }))}
          />

          <div className="space-y-1 text-left">
            <label className="block text-xs font-medium text-slate-700">Description & Instructions</label>
            <textarea
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="State problem statements, requirements, and evaluation rubrics..."
              className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Submission Deadline"
              type="datetime-local"
              required
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            />
            <Input
              label="Maximum Marks"
              type="number"
              required
              value={formData.max_marks}
              onChange={(e) => setFormData({ ...formData, max_marks: parseFloat(e.target.value) || 50 })}
            />
          </div>

          <Input
            label="Allowed File Formats (comma-separated)"
            value={formData.allowed_file_types}
            onChange={(e) => setFormData({ ...formData, allowed_file_types: e.target.value })}
            placeholder="pdf,sql,zip,txt"
          />

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Publish Assignment
            </Button>
          </div>
        </form>
      </Modal>

      {/* VIEW & GRADE SUBMISSIONS MODAL */}
      <Modal
        isOpen={isSubmissionsOpen}
        onClose={() => setIsSubmissionsOpen(false)}
        title={`Submissions: ${selectedAssignment?.title}`}
        description={`Max Marks: ${selectedAssignment?.max_marks} | Total Submissions: ${submissions.length}`}
        maxWidth="2xl"
      >
        <div className="space-y-4">
          {submissions.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No students have submitted coursework for this assignment yet.
            </div>
          ) : (
            submissions.map((sub) => (
              <div key={sub.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-slate-900">{sub.student_name}</span>
                    <span className="text-slate-400 text-[11px] ml-2 font-mono">({sub.student_usn})</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Submitted: {new Date(sub.submitted_at).toLocaleString()}
                  </span>
                </div>

                {sub.text_content && (
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap">
                    {sub.text_content}
                  </div>
                )}

                {/* Grade input form */}
                <div className="pt-2 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase">Score (Max {selectedAssignment?.max_marks})</label>
                    <input
                      type="number"
                      step="0.5"
                      max={selectedAssignment?.max_marks}
                      min="0"
                      value={gradingState[sub.id]?.marks ?? ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setGradingState({
                          ...gradingState,
                          [sub.id]: { ...gradingState[sub.id], marks: val },
                        });
                      }}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase">Feedback</label>
                    <input
                      type="text"
                      placeholder="e.g. Good normalized schema"
                      value={gradingState[sub.id]?.feedback ?? ''}
                      onChange={(e) => {
                        setGradingState({
                          ...gradingState,
                          [sub.id]: { ...gradingState[sub.id], feedback: e.target.value },
                        });
                      }}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                    />
                  </div>

                  <div className="pt-4">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleGradeSubmission(sub.id)}
                      className="w-full text-xs"
                    >
                      Save Evaluation
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
};
