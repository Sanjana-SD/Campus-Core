import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Plus,
  Search,
  Edit2,
  Trash2,
  Mail,
  Phone,
  BookOpen
} from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const LecturersManagement: React.FC = () => {
  const [lecturers, setLecturers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingLecturer, setEditingLecturer] = useState<any>(null);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    username: '',
    employee_id: '',
    department_id: '',
    designation: 'Assistant Professor',
    qualification: '',
    specialization: '',
    phone: '',
    password: 'Lecturer@123',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLecturers = async () => {
    try {
      setLoading(true);
      let query = '/lecturers?limit=100';
      if (search) query += `&search=${encodeURIComponent(search)}`;
      if (deptFilter) query += `&department_id=${deptFilter}`;

      const [lectRes, deptRes] = await Promise.all([
        ApiClient.get<any[]>(query),
        ApiClient.get<any[]>('/academic/departments'),
      ]);
      setLecturers(lectRes || []);
      setDepartments(deptRes || []);
    } catch (err) {
      console.error('Error fetching lecturers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLecturers();
  }, [deptFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await ApiClient.post('/lecturers', {
        ...formData,
        department_id: parseInt(formData.department_id),
      });
      setIsAddOpen(false);
      resetForm();
      fetchLecturers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create lecturer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLecturer) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      await ApiClient.put(`/lecturers/${editingLecturer.id}`, {
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        department_id: formData.department_id ? parseInt(formData.department_id) : undefined,
        designation: formData.designation,
        qualification: formData.qualification,
        specialization: formData.specialization,
      });
      setIsEditOpen(false);
      setEditingLecturer(null);
      resetForm();
      fetchLecturers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update lecturer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (id: number, empId: string) => {
    if (!confirm(`Are you sure you want to deactivate lecturer ${empId}?`)) return;
    try {
      await ApiClient.delete(`/lecturers/${id}`);
      fetchLecturers();
    } catch (err: any) {
      alert(err.message || 'Error deactivating lecturer');
    }
  };

  const openEditModal = (lec: any) => {
    setEditingLecturer(lec);
    setFormData({
      full_name: lec.user?.full_name || '',
      email: lec.user?.email || '',
      username: lec.user?.username || '',
      employee_id: lec.employee_id,
      department_id: String(lec.department_id || ''),
      designation: lec.designation || 'Assistant Professor',
      qualification: lec.qualification || '',
      specialization: lec.specialization || '',
      phone: lec.user?.phone || '',
      password: '',
    });
    setFormError(null);
    setIsEditOpen(true);
  };

  const resetForm = () => {
    setFormData({
      full_name: '',
      email: '',
      username: '',
      employee_id: '',
      department_id: departments[0]?.id ? String(departments[0].id) : '',
      designation: 'Assistant Professor',
      qualification: '',
      specialization: '',
      phone: '',
      password: 'Lecturer@123',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Faculty & Lecturer Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage academic instructors, employee assignments, and teaching responsibilities.
          </p>
        </div>
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
          Add Lecturer
        </Button>
      </div>

      {/* Filter Card */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input
              placeholder="Search by lecturer name, employee ID, or specialization..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchLecturers()}
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
        </div>
      </Card>

      {/* Lecturers Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <LoadingSpinner message="Fetching faculty directory..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Lecturer Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Specialization</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lecturers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No faculty records found.
                    </td>
                  </tr>
                ) : (
                  lecturers.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{l.employee_id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        <div>{l.user?.full_name}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{l.qualification || 'M.Tech / Ph.D.'}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">{l.department?.code || 'CSE'}</td>
                      <td className="py-3 px-4 text-slate-700">{l.designation}</td>
                      <td className="py-3 px-4 text-slate-600">{l.specialization || 'General Engineering'}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{l.user?.email}</td>
                      <td className="py-3 px-4">
                        {l.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(l)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors"
                            title="Edit Lecturer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeactivate(l.id, l.employee_id)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-md transition-colors"
                            title="Deactivate Lecturer"
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

      {/* CREATE LECTURER MODAL */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Faculty / Lecturer"
        description="Creates faculty user account and binds departmental privileges."
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
              label="Full Name (with Title)"
              required
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="e.g. Dr. Alan Turing"
            />
            <Input
              label="Employee ID"
              required
              value={formData.employee_id}
              onChange={(e) => setFormData({ ...formData, employee_id: e.target.value.toUpperCase() })}
              placeholder="e.g. EMP-CSE-001"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Official Email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
              placeholder="alan.turing@campuscore.edu"
            />
            <Input
              label="Username"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="turing"
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
            <Input
              label="Designation"
              required
              value={formData.designation}
              onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
              placeholder="e.g. Associate Professor"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Qualification"
              value={formData.qualification}
              onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
              placeholder="Ph.D. in Computer Science"
            />
            <Input
              label="Specialization"
              value={formData.specialization}
              onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
              placeholder="Cryptography & Algorithms"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Save Lecturer
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT LECTURER MODAL */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Faculty Details"
        description="Update faculty profile and departmental assignment."
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
              label="Employee ID"
              disabled
              value={formData.employee_id}
              helperText="Employee ID is fixed."
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
            <Select
              label="Department"
              value={formData.department_id}
              onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
              options={departments.map((d) => ({ label: `${d.code} - ${d.name}`, value: d.id }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Designation"
              value={formData.designation}
              onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
            />
            <Input
              label="Specialization"
              value={formData.specialization}
              onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Update Faculty Profile
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
