import React, { useState, useEffect } from 'react';
import {
  FolderTree,
  Plus,
  BookOpen,
  Layers,
  GraduationCap,
  Calendar,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const AcademicManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'departments' | 'courses' | 'subjects' | 'sections'>('departments');
  const [departments, setDepartments] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isDeptModal, setIsDeptModal] = useState(false);
  const [isCourseModal, setIsCourseModal] = useState(false);
  const [isSubjModal, setIsSubjModal] = useState(false);
  const [isSecModal, setIsSecModal] = useState(false);

  // Forms
  const [deptForm, setDeptForm] = useState({ code: '', name: '', description: '' });
  const [courseForm, setCourseForm] = useState({ code: '', name: '', department_id: '', duration_years: 4, total_semesters: 8 });
  const [subjForm, setSubjForm] = useState({ code: '', name: '', department_id: '', credits: 3, total_hours: 45 });
  const [secForm, setSecForm] = useState({ name: '', semester_id: 1 });
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [deptRes, courseRes, subjRes, secRes] = await Promise.all([
        ApiClient.get<any[]>('/academic/departments'),
        ApiClient.get<any[]>('/academic/courses'),
        ApiClient.get<any[]>('/academic/subjects'),
        ApiClient.get<any[]>('/academic/sections'),
      ]);
      setDepartments(deptRes || []);
      setCourses(courseRes || []);
      setSubjects(subjRes || []);
      setSections(secRes || []);
    } catch (err) {
      console.error('Error fetching academic hierarchy:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await ApiClient.post('/academic/departments', deptForm);
      setIsDeptModal(false);
      setDeptForm({ code: '', name: '', description: '' });
      fetchAll();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create department');
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await ApiClient.post('/academic/courses', {
        ...courseForm,
        department_id: parseInt(courseForm.department_id),
      });
      setIsCourseModal(false);
      setCourseForm({ code: '', name: '', department_id: '', duration_years: 4, total_semesters: 8 });
      fetchAll();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create course');
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await ApiClient.post('/academic/subjects', {
        ...subjForm,
        department_id: parseInt(subjForm.department_id),
      });
      setIsSubjModal(false);
      setSubjForm({ code: '', name: '', department_id: '', credits: 3, total_hours: 45 });
      fetchAll();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create subject');
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await ApiClient.post('/academic/sections', {
        name: secForm.name,
        semester_id: 1, // default semester
      });
      setIsSecModal(false);
      setSecForm({ name: '', semester_id: 1 });
      fetchAll();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create section');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Academic Architecture</h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure institutional departments, degree programs, curriculum subjects, and sections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'departments' && (
            <Button variant="primary" size="sm" onClick={() => setIsDeptModal(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add Department
            </Button>
          )}
          {activeTab === 'courses' && (
            <Button variant="primary" size="sm" onClick={() => setIsCourseModal(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add Program
            </Button>
          )}
          {activeTab === 'subjects' && (
            <Button variant="primary" size="sm" onClick={() => setIsSubjModal(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add Subject
            </Button>
          )}
          {activeTab === 'sections' && (
            <Button variant="primary" size="sm" onClick={() => setIsSecModal(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add Section
            </Button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 flex gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('departments')}
          className={`pb-3 px-1 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'departments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Departments ({departments.length})
        </button>
        <button
          onClick={() => setActiveTab('courses')}
          className={`pb-3 px-1 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'courses' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Programs & Courses ({courses.length})
        </button>
        <button
          onClick={() => setActiveTab('subjects')}
          className={`pb-3 px-1 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'subjects' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Subjects & Modules ({subjects.length})
        </button>
        <button
          onClick={() => setActiveTab('sections')}
          className={`pb-3 px-1 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'sections' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Classes & Sections ({sections.length})
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <LoadingSpinner message="Loading academic schema..." />
      ) : (
        <div>
          {/* DEPARTMENTS TAB */}
          {activeTab === 'departments' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {departments.map((d) => (
                <Card key={d.id} className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {d.code}
                    </span>
                    <span className="text-[11px] text-slate-400">ID #{d.id}</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">{d.name}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2">{d.description || 'Active department'}</p>
                </Card>
              ))}
            </div>
          )}

          {/* COURSES TAB */}
          {activeTab === 'courses' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courses.map((c) => (
                <Card key={c.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {c.code}
                    </span>
                    <span className="text-[11px] text-slate-500">{c.duration_years} Years ({c.total_semesters} Sems)</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">{c.name}</h3>
                  <p className="text-xs text-slate-500">Department: {c.department?.name || 'Assigned'}</p>
                </Card>
              ))}
            </div>
          )}

          {/* SUBJECTS TAB */}
          {activeTab === 'subjects' && (
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Subject Code</th>
                    <th className="py-3 px-4">Subject Title</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Credits</th>
                    <th className="py-3 px-4">Hours / Sem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subjects.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">{sub.code}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{sub.name}</td>
                      <td className="py-3 px-4 text-slate-600">{sub.department?.code || 'CSE'}</td>
                      <td className="py-3 px-4 font-semibold text-slate-700">{sub.credits} Credits</td>
                      <td className="py-3 px-4 text-slate-500">{sub.total_hours} hrs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* SECTIONS TAB */}
          {activeTab === 'sections' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {sections.map((sec) => (
                <Card key={sec.id} className="text-center p-6">
                  <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg mx-auto mb-2">
                    {sec.name}
                  </div>
                  <div className="text-xs font-semibold text-slate-800">Section {sec.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Enrolled Students Batch</div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DEPARTMENT MODAL */}
      <Modal isOpen={isDeptModal} onClose={() => setIsDeptModal(false)} title="Add Academic Department">
        <form onSubmit={handleCreateDept} className="space-y-4">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700 text-xs">{formError}</div>}
          <Input label="Department Code" required value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })} placeholder="e.g. ME" />
          <Input label="Department Name" required value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} placeholder="Mechanical Engineering" />
          <Input label="Description" value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} placeholder="Brief overview of department" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsDeptModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit">Save Department</Button>
          </div>
        </form>
      </Modal>

      {/* COURSE MODAL */}
      <Modal isOpen={isCourseModal} onClose={() => setIsCourseModal(false)} title="Add Degree Course / Program">
        <form onSubmit={handleCreateCourse} className="space-y-4">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700 text-xs">{formError}</div>}
          <Input label="Course Code" required value={courseForm.code} onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value.toUpperCase() })} placeholder="e.g. BTECH-ME" />
          <Input label="Course Title" required value={courseForm.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })} placeholder="Bachelor of Technology in ME" />
          <Select label="Department" required value={courseForm.department_id} onChange={(e) => setCourseForm({ ...courseForm, department_id: e.target.value })} options={departments.map((d) => ({ label: d.name, value: d.id }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsCourseModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit">Save Course</Button>
          </div>
        </form>
      </Modal>

      {/* SUBJECT MODAL */}
      <Modal isOpen={isSubjModal} onClose={() => setIsSubjModal(false)} title="Add Academic Subject">
        <form onSubmit={handleCreateSubject} className="space-y-4">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700 text-xs">{formError}</div>}
          <Input label="Subject Code" required value={subjForm.code} onChange={(e) => setSubjForm({ ...subjForm, code: e.target.value.toUpperCase() })} placeholder="e.g. ME301" />
          <Input label="Subject Name" required value={subjForm.name} onChange={(e) => setSubjForm({ ...subjForm, name: e.target.value })} placeholder="Thermodynamics & Heat Transfer" />
          <Select label="Department" required value={subjForm.department_id} onChange={(e) => setSubjForm({ ...subjForm, department_id: e.target.value })} options={departments.map((d) => ({ label: d.name, value: d.id }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Credits" type="number" required value={subjForm.credits} onChange={(e) => setSubjForm({ ...subjForm, credits: parseInt(e.target.value) || 3 })} />
            <Input label="Total Hours" type="number" required value={subjForm.total_hours} onChange={(e) => setSubjForm({ ...subjForm, total_hours: parseInt(e.target.value) || 45 })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsSubjModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit">Save Subject</Button>
          </div>
        </form>
      </Modal>

      {/* SECTION MODAL */}
      <Modal isOpen={isSecModal} onClose={() => setIsSecModal(false)} title="Add Class Section">
        <form onSubmit={handleCreateSection} className="space-y-4">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700 text-xs">{formError}</div>}
          <Input label="Section Identifier" required value={secForm.name} onChange={(e) => setSecForm({ ...secForm, name: e.target.value.toUpperCase() })} placeholder="e.g. C" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsSecModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit">Save Section</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
