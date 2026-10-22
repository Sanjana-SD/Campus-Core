import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Upload,
  Download,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  QrCode
} from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const StudentsManagement: React.FC = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [rfidFilter, setRfidFilter] = useState('');

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);

  // Form states
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    username: '',
    student_id_number: '',
    rfid_uid: '',
    department_id: '',
    course_id: '',
    phone: '',
    password: 'Student@123'
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // CSV Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any>(null);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      let query = '/students?limit=100';
      if (search) query += `&search=${encodeURIComponent(search)}`;
      if (deptFilter) query += `&department_id=${deptFilter}`;
      if (rfidFilter === 'yes') query += `&has_rfid=true`;
      if (rfidFilter === 'no') query += `&has_rfid=false`;

      const [studRes, deptRes, courseRes] = await Promise.all([
        ApiClient.get<any[]>(query),
        ApiClient.get<any[]>('/academic/departments'),
        ApiClient.get<any[]>('/academic/courses'),
      ]);
      setStudents(studRes || []);
      setDepartments(deptRes || []);
      setCourses(courseRes || []);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [deptFilter, rfidFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStudents();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await ApiClient.post('/students', {
        ...formData,
        department_id: parseInt(formData.department_id),
        course_id: parseInt(formData.course_id),
      });
      setIsAddOpen(false);
      resetForm();
      fetchStudents();
    } catch (err: any) {
      setFormError(err.message || 'Failed to register student');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      await ApiClient.put(`/students/${editingStudent.id}`, {
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        rfid_uid: formData.rfid_uid,
        department_id: formData.department_id ? parseInt(formData.department_id) : undefined,
        course_id: formData.course_id ? parseInt(formData.course_id) : undefined,
      });
      setIsEditOpen(false);
      setEditingStudent(null);
      resetForm();
      fetchStudents();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update student');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (id: number, usn: string) => {
    if (!confirm(`Are you sure you want to deactivate student ${usn}?`)) return;
    try {
      await ApiClient.delete(`/students/${id}`);
      fetchStudents();
    } catch (err: any) {
      alert(err.message || 'Error deactivating student');
    }
  };

  const openEditModal = (student: any) => {
    setEditingStudent(student);
    setFormData({
      full_name: student.user?.full_name || '',
      email: student.user?.email || '',
      username: student.user?.username || '',
      student_id_number: student.student_id_number,
      rfid_uid: student.rfid_uid || '',
      department_id: String(student.department_id || ''),
      course_id: String(student.course_id || ''),
      phone: student.user?.phone || '',
      password: '',
    });
    setFormError(null);
    setIsEditOpen(true);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    setIsSubmitting(true);
    setImportResult(null);
    try {
      const res = await ApiClient.uploadFile<any>('/students/import-csv', importFile);
      setImportResult(res);
      fetchStudents();
    } catch (err: any) {
      setImportResult({ error: err.message || 'Import failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      full_name: '',
      email: '',
      username: '',
      student_id_number: '',
      rfid_uid: '',
      department_id: departments[0]?.id ? String(departments[0].id) : '',
      course_id: courses[0]?.id ? String(courses[0].id) : '',
      phone: '',
      password: 'Student@123',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Student Information System</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage student registrations, academic enrollment, and hardware RFID UID assignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/v1/students/export/csv" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />}>
              Export CSV
            </Button>
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setImportFile(null);
              setImportResult(null);
              setIsImportOpen(true);
            }}
            leftIcon={<Upload className="w-3.5 h-3.5" />}
          >
            Import CSV
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              resetForm();
              setFormError(null);
              setIsAddOpen(true);
            }}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Register Student
          </Button>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <Card className="p-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <Input
              placeholder="Search by student name, USN, email, or RFID UID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full h-9.5 text-xs rounded-lg border border-slate-300 bg-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} - {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={rfidFilter}
              onChange={(e) => setRfidFilter(e.target.value)}
              className="w-full h-9.5 text-xs rounded-lg border border-slate-300 bg-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All RFID Statuses</option>
              <option value="yes">Card Assigned</option>
              <option value="no">No Card Assigned</option>
            </select>
          </div>
        </form>
      </Card>

      {/* Students Data Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <LoadingSpinner message="Fetching student directory..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">USN / Roll Number</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Department & Course</th>
                  <th className="py-3 px-4">Official Email</th>
                  <th className="py-3 px-4">RFID UID</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No students found matching current filters.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.student_id_number}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{s.user?.full_name}</td>
                      <td className="py-3 px-4 text-slate-600">
                        <span className="font-semibold text-slate-800">{s.department?.code || 'CSE'}</span>
                        <span className="text-slate-400 ml-1.5">({s.course?.code || 'B.Tech'})</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{s.user?.email}</td>
                      <td className="py-3 px-4">
                        {s.rfid_uid ? (
                          <span className="inline-flex items-center gap-1 font-mono font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                            <QrCode className="w-3 h-3 text-blue-500" />
                            {s.rfid_uid}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Not Registered</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {s.is_active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="danger">Inactive</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(s)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors"
                            title="Edit Student"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeactivate(s.id, s.student_id_number)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-md transition-colors"
                            title="Deactivate Student"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* CREATE STUDENT MODAL */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Register New Student"
        description="Creates student account, sets academic credentials, and binds hardware RFID UID."
        maxWidth="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Full Name"
              required
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="e.g. Rahul Sharma"
            />
            <Input
              label="Student ID / USN"
              required
              value={formData.student_id_number}
              onChange={(e) => setFormData({ ...formData, student_id_number: e.target.value.toUpperCase() })}
              placeholder="e.g. 1CC22CS001"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Official Email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
              placeholder="rahul@campuscore.edu"
            />
            <Input
              label="Username"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="e.g. rahul"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Department"
              required
              value={formData.department_id}
              onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
              options={departments.map((d) => ({ label: `${d.code} - ${d.name}`, value: d.id }))}
            />
            <Select
              label="Program / Course"
              required
              value={formData.course_id}
              onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
              options={courses.map((c) => ({ label: `${c.code} - ${c.name}`, value: c.id }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="RFID Smart Card UID"
              value={formData.rfid_uid}
              onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value.toUpperCase() })}
              placeholder="e.g. A1B2C3D4"
              helperText="Hardware UID recorded during card tapping."
            />
            <Input
              label="Contact Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+91 98765 43210"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Save Student Registration
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT STUDENT MODAL */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Student Profile"
        description="Update profile details, department enrollment, or re-bind RFID smart card UID."
        maxWidth="lg"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Full Name"
              required
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            />
            <Input
              label="Student ID / USN"
              disabled
              value={formData.student_id_number}
              helperText="Student USN is immutable."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Official Email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <Input
              label="Contact Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Department"
              value={formData.department_id}
              onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
              options={departments.map((d) => ({ label: `${d.code} - ${d.name}`, value: d.id }))}
            />
            <Select
              label="Course"
              value={formData.course_id}
              onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
              options={courses.map((c) => ({ label: `${c.code} - ${c.name}`, value: c.id }))}
            />
          </div>

          <Input
            label="RFID Smart Card UID"
            value={formData.rfid_uid}
            onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value.toUpperCase() })}
            placeholder="e.g. A1B2C3D4"
            helperText="Clear to unbind card; enter new UID to assign."
          />

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Update Student Profile
            </Button>
          </div>
        </form>
      </Modal>

      {/* CSV IMPORT MODAL */}
      <Modal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Import Students from CSV"
        description="Upload a CSV file containing columns: USN, Name, Email, RFID"
        maxWidth="md"
      >
        <form onSubmit={handleImportSubmit} className="space-y-4">
          <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl text-center bg-slate-50">
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <input
              type="file"
              accept=".csv"
              required
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
            <p className="text-[11px] text-slate-400 mt-2">Maximum file size: 5MB</p>
          </div>

          {importResult && (
            <div className={`p-3 rounded-lg text-xs ${importResult.error ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
              {importResult.error ? (
                <div>{importResult.error}</div>
              ) : (
                <div>
                  <div className="font-bold">Import Complete!</div>
                  <div>Imported {importResult.imported_count} student records.</div>
                  {importResult.error_count > 0 && (
                    <div className="text-amber-700 mt-1">{importResult.error_count} rows skipped due to duplicate USN/Email.</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsImportOpen(false)}>
              Close
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting} disabled={!importFile}>
              Run CSV Import
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
