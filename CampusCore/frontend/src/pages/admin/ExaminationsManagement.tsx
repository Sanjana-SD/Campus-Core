import React, { useState, useEffect } from 'react';
import {
  Award,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Send,
  AlertCircle
} from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const ExaminationsManagement: React.FC = () => {
  const [exams, setExams] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isMarksOpen, setIsMarksOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [examMarks, setExamMarks] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    exam_type: 'INTERNAL_1',
    subject_id: '',
    exam_date: new Date().toISOString().split('T')[0],
    start_time: '10:00',
    end_time: '11:30',
    max_marks: 50.0,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [exRes, subjRes, studRes] = await Promise.all([
        ApiClient.get<any[]>('/exams'),
        ApiClient.get<any[]>('/academic/subjects'),
        ApiClient.get<any[]>('/students?limit=200'),
      ]);
      setExams(exRes || []);
      setSubjects(subjRes || []);
      setStudents(studRes || []);
      if (subjRes?.length) setFormData((prev) => ({ ...prev, subject_id: String(subjRes[0].id) }));
    } catch (err) {
      console.error('Error fetching exams:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await ApiClient.post('/exams', {
        ...formData,
        subject_id: parseInt(formData.subject_id),
        max_marks: parseFloat(String(formData.max_marks)),
      });
      setIsAddOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to create exam');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishResults = async (id: number) => {
    if (!confirm('Are you sure you want to publish these results to students?')) return;
    try {
      await ApiClient.post(`/exams/${id}/publish`);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error publishing results');
    }
  };

  const openMarksEntry = async (exam: any) => {
    setSelectedExam(exam);
    try {
      const marksRes = await ApiClient.get<any[]>(`/exams/${exam.id}/marks`);
      // Prepare marks map for existing entries
      const marksMap = new Map();
      marksRes.forEach((m) => marksMap.set(m.student_id, m));

      const initialRows = students.map((s) => ({
        student_id: s.id,
        student_name: s.user?.full_name,
        student_usn: s.student_id_number,
        marks_obtained: marksMap.get(s.id)?.marks_obtained ?? 0,
        is_absent: marksMap.get(s.id)?.is_absent ?? false,
        remarks: marksMap.get(s.id)?.remarks ?? '',
      }));
      setExamMarks(initialRows);
      setIsMarksOpen(true);
    } catch (err) {
      console.error('Error opening marks entry:', err);
    }
  };

  const handleSaveMarks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam) return;
    setIsSubmitting(true);
    try {
      await ApiClient.post(`/exams/${selectedExam.id}/marks`, examMarks);
      setIsMarksOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error saving marks');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Examinations & Marks Evaluation</h1>
          <p className="text-xs text-slate-500 mt-1">
            Schedule internal assessments, enter marks, maintain audit trails, and publish student scores.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsAddOpen(true)}
          leftIcon={<Plus className="w-3.5 h-3.5" />}
        >
          Schedule Examination
        </Button>
      </div>

      {/* Examinations Grid */}
      {loading ? (
        <LoadingSpinner message="Loading examinations catalog..." />
      ) : exams.length === 0 ? (
        <Card className="text-center p-12">
          <Award className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-800">No Examinations Scheduled</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Schedule Internal Assessments or Final Exams to track student academic performance.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exams.map((ex) => (
            <Card key={ex.id} className="relative hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {ex.subject?.code}
                </span>
                {ex.is_published ? (
                  <Badge variant="success">Published</Badge>
                ) : (
                  <Badge variant="warning">Draft (Unpublished)</Badge>
                )}
              </div>

              <h4 className="text-base font-bold text-slate-900 mb-1">{ex.name}</h4>
              <p className="text-xs text-slate-500 mb-3">{ex.subject?.name}</p>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1 mb-4">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Exam Date:</span>
                  <span className="font-semibold text-slate-800">{ex.exam_date}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Slot:</span>
                  <span className="font-mono text-slate-800">{ex.start_time} - {ex.end_time}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Maximum Marks:</span>
                  <span className="font-bold text-slate-900">{ex.max_marks} pts</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openMarksEntry(ex)}
                  className="flex-1 text-xs"
                >
                  Enter / Edit Marks
                </Button>
                {!ex.is_published && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handlePublishResults(ex.id)}
                    className="text-xs"
                  >
                    Publish
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* SCHEDULE EXAM MODAL */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Schedule Academic Examination"
        description="Configure internal assessment details and scoring limits."
        maxWidth="md"
      >
        <form onSubmit={handleCreateExam} className="space-y-4">
          <Input
            label="Examination Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Internal Assessment 2 - Spring 2026"
          />

          <Select
            label="Subject"
            required
            value={formData.subject_id}
            onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
            options={subjects.map((s) => ({ label: `${s.code} - ${s.name}`, value: s.id }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Evaluation Type"
              required
              value={formData.exam_type}
              onChange={(e) => setFormData({ ...formData, exam_type: e.target.value })}
              options={[
                { label: 'Internal Assessment 1', value: 'INTERNAL_1' },
                { label: 'Internal Assessment 2', value: 'INTERNAL_2' },
                { label: 'Semester Final Exam', value: 'SEMESTER_FINAL' },
                { label: 'Practical Lab Exam', value: 'PRACTICAL' },
              ]}
            />
            <Input
              label="Max Marks"
              type="number"
              required
              value={formData.max_marks}
              onChange={(e) => setFormData({ ...formData, max_marks: parseFloat(e.target.value) || 50 })}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input
              label="Date"
              type="date"
              required
              value={formData.exam_date}
              onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
            />
            <Input
              label="Start Time"
              type="time"
              required
              value={formData.start_time}
              onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
            />
            <Input
              label="End Time"
              type="time"
              required
              value={formData.end_time}
              onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Schedule Examination
            </Button>
          </div>
        </form>
      </Modal>

      {/* MARKS ENTRY MODAL */}
      <Modal
        isOpen={isMarksOpen}
        onClose={() => setIsMarksOpen(false)}
        title={`Enter Marks: ${selectedExam?.name}`}
        description={`Maximum Marks: ${selectedExam?.max_marks} | Subject: ${selectedExam?.subject?.name}`}
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveMarks} className="space-y-4">
          <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Student USN</th>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3 w-28">Marks</th>
                  <th className="py-2.5 px-3">Absent?</th>
                  <th className="py-2.5 px-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {examMarks.map((row, idx) => (
                  <tr key={row.student_id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-semibold">{row.student_usn}</td>
                    <td className="py-2 px-3 font-medium text-slate-800">{row.student_name}</td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.5"
                        max={selectedExam?.max_marks}
                        min="0"
                        disabled={row.is_absent}
                        value={row.marks_obtained}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const next = [...examMarks];
                          next[idx].marks_obtained = val;
                          setExamMarks(next);
                        }}
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={row.is_absent}
                        onChange={(e) => {
                          const next = [...examMarks];
                          next[idx].is_absent = e.target.checked;
                          if (e.target.checked) next[idx].marks_obtained = 0;
                          setExamMarks(next);
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-0"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={row.remarks}
                        onChange={(e) => {
                          const next = [...examMarks];
                          next[idx].remarks = e.target.value;
                          setExamMarks(next);
                        }}
                        placeholder="Optional remarks"
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsMarksOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Save All Marks
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
