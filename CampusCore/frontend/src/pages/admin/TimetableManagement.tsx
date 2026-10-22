import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock, Coffee, LayoutGrid, List, MapPin, Pencil, Plus, Trash2, User } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { cn, errorMessage, formatDate, todayISO } from '../../lib/utils';
import { Card, CardDescription, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog, ErrorState, PageHeader, Skeleton, Table, TableSkeleton, Tabs, Td, Th } from '../../components/ui/Kit';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { Checkbox, FilterGrid, InlineAlert } from './AttendanceKit';
import { addDays, mondayOf, useApi, useLookups, WEEKDAYS, type Lookups } from './attendanceShared';

interface ScheduleEntry {
  id: number;
  subject_id: number;
  lecturer_id: number;
  section_id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room_number: string;
  academic_year_id: number | null;
  academic_term: string | null;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  subject: { id: number; code: string; name: string; department_id: number } | null;
  lecturer_name: string | null;
  section_label: string | null;
  department_id: number | null;
}

interface BreakItem {
  id: number;
  section_id: number | null;
  section_label: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  label: string;
}

interface WeekSession {
  id: number;
  date: string;
  day: string;
  start_time: string;
  end_time: string;
  subject_code: string | null;
  subject_name: string | null;
  lecturer_name: string | null;
  section: string | null;
  room_number: string | null;
  status: string;
  cancel_reason: string | null;
}

interface FormState {
  subject_id: string;
  lecturer_id: string;
  section_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room_number: string;
  academic_year_id: string;
  academic_term: string;
  effective_from: string;
  effective_to: string;
  allow_conflict: boolean;
}

const blankForm = (lk: Lookups, sectionId?: string, day?: string): FormState => ({
  subject_id: lk.subjects[0] ? String(lk.subjects[0].id) : '',
  lecturer_id: lk.lecturers[0] ? String(lk.lecturers[0].id) : '',
  section_id: sectionId || (lk.sections[0] ? String(lk.sections[0].id) : ''),
  day_of_week: day || 'Monday',
  start_time: '09:00',
  end_time: '10:00',
  room_number: '',
  academic_year_id: String(lk.years.find((y) => y.is_current)?.id ?? ''),
  academic_term: '',
  effective_from: '',
  effective_to: '',
  allow_conflict: false,
});

export const TimetableManagement: React.FC = () => {
  const toast = useToast();
  const lk = useLookups(['departments', 'subjects', 'sections', 'lecturers', 'years']);
  const [view, setView] = useState('grid');
  const [gridSectionChoice, setGridSection] = useState('');
  const gridSection = gridSectionChoice || (lk.sections[0] ? String(lk.sections[0].id) : '');
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  // Create / edit
  const [editing, setEditing] = useState<ScheduleEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<ScheduleEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = (day?: string) => {
    setEditing(null);
    setForm(blankForm(lk, view === 'grid' ? gridSection : undefined, day));
    setFormErrors([]);
    setFormOpen(true);
  };
  const openEdit = (e: ScheduleEntry) => {
    setEditing(e);
    setForm({
      subject_id: String(e.subject_id),
      lecturer_id: String(e.lecturer_id),
      section_id: String(e.section_id),
      day_of_week: e.day_of_week,
      start_time: e.start_time,
      end_time: e.end_time,
      room_number: e.room_number,
      academic_year_id: e.academic_year_id ? String(e.academic_year_id) : '',
      academic_term: e.academic_term || '',
      effective_from: '',
      effective_to: e.effective_to || '',
      allow_conflict: false,
    });
    setFormErrors([]);
    setFormOpen(true);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form) return;
    const errs: string[] = [];
    if (!form.subject_id || !form.lecturer_id || !form.section_id) errs.push('Subject, lecturer and section are required.');
    if (!form.room_number.trim()) errs.push('Room is required.');
    if (form.start_time >= form.end_time) errs.push('Start time must be before end time.');
    if (form.effective_from && form.effective_to && form.effective_to < form.effective_from) errs.push('Effective end date must be on or after the start date.');
    setFormErrors(errs);
    if (errs.length) return;
    const body = {
      subject_id: Number(form.subject_id),
      lecturer_id: Number(form.lecturer_id),
      section_id: Number(form.section_id),
      day_of_week: form.day_of_week,
      start_time: form.start_time,
      end_time: form.end_time,
      room_number: form.room_number.trim().toUpperCase(),
      academic_year_id: form.academic_year_id ? Number(form.academic_year_id) : null,
      academic_term: form.academic_term.trim() || null,
      effective_from: form.effective_from || null,
      effective_to: form.effective_to || null,
      allow_conflict: form.allow_conflict,
    };
    setSaving(true);
    try {
      if (editing) {
        const res = await ApiClient.put<ScheduleEntry & { message: string }>(`/timetable/${editing.id}`, body);
        toast.success('Timetable entry updated', res.message);
      } else {
        await ApiClient.post<ScheduleEntry>('/timetable', body);
        toast.success('Timetable period added', form.allow_conflict ? 'Saved as an audited conflict exception.' : undefined);
      }
      setFormOpen(false);
      refresh();
    } catch (e) {
      setFormErrors(errorMessage(e).split('; ').filter(Boolean));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      const res = await ApiClient.delete<{ message: string }>(`/timetable/${del.id}`);
      toast.success('Timetable entry removed', res.message);
      setDel(null);
      refresh();
    } catch (e) {
      toast.error('Could not delete', errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const hasConflictError = formErrors.some((e) => /conflict|overlaps/i.test(e));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Academics"
        title="Timetable"
        description="Weekly class schedule used to generate class sessions and evaluate attendance. Section, lecturer and room clashes are prevented. Edits are versioned so past classes keep their original times."
        actions={<Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => openCreate()} disabled={lk.lookupsLoading}>Add timetable period</Button>}
      />
      {lk.lookupError && <InlineAlert tone="warning">{lk.lookupError}</InlineAlert>}
      <Tabs
        tabs={[
          { id: 'grid', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="w-3.5 h-3.5" /> Weekly grid</span> },
          { id: 'list', label: <span className="inline-flex items-center gap-1.5"><List className="w-3.5 h-3.5" /> List</span> },
          { id: 'week', label: <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> This week</span> },
          { id: 'breaks', label: <span className="inline-flex items-center gap-1.5"><Coffee className="w-3.5 h-3.5" /> Breaks</span> },
        ]}
        active={view}
        onChange={setView}
      />

      {view === 'grid' && <GridView lk={lk} sectionId={gridSection} setSectionId={setGridSection} tick={tick} onAdd={openCreate} onEdit={openEdit} onDelete={setDel} />}
      {view === 'list' && <ListView lk={lk} tick={tick} onEdit={openEdit} onDelete={setDel} />}
      {view === 'week' && <WeekView lk={lk} tick={tick} />}
      {view === 'breaks' && <BreaksView lk={lk} />}

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit timetable period' : 'Add timetable period'} description={editing ? 'If classes were already held, the old entry is closed and a new version starts on the effective date.' : 'Conflicts with sections, lecturers, rooms and breaks are checked automatically.'} maxWidth="xl">
        {form && (
          <form onSubmit={submit} className="space-y-4">
            {formErrors.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">
                <p className="font-semibold flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3.5 h-3.5" /> {hasConflictError ? 'Scheduling conflicts' : 'Please fix the following'}</p>
                <ul className="list-disc pl-5 space-y-0.5">{formErrors.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
            <Select label="Subject" required value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} options={lk.subjects.map((s) => ({ label: `${s.code} — ${s.name}`, value: String(s.id) }))} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Select label="Lecturer" required value={form.lecturer_id} onChange={(e) => setForm({ ...form, lecturer_id: e.target.value })} options={lk.lecturers.map((l) => ({ label: `${l.user?.full_name || 'Unnamed'} (${l.employee_id})`, value: String(l.id) }))} />
              <Select label="Section" required value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })} options={lk.sections.map((s) => ({ label: s.label, value: String(s.id) }))} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Select label="Day" required value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })} options={WEEKDAYS.map((d) => ({ label: d, value: d }))} />
              <Input label="Start" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              <Input label="End" type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              <Input label="Room" required value={form.room_number} placeholder="LH-101" onChange={(e) => setForm({ ...form, room_number: e.target.value.toUpperCase() })} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Select label="Academic year" placeholder="Not set" value={form.academic_year_id} onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })} options={lk.years.map((y) => ({ label: `${y.name}${y.is_current ? ' (current)' : ''}`, value: String(y.id) }))} />
              <Input label="Academic term" placeholder="e.g. Odd semester" value={form.academic_term} onChange={(e) => setForm({ ...form, academic_term: e.target.value })} />
              <Input label="Effective from" type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} helperText={editing ? 'Empty = change applies from today' : 'Empty = no start limit'} />
              <Input label="Effective to" type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} helperText="Empty = open-ended" />
            </div>
            <div className={cn('rounded-lg p-3', hasConflictError ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-100')}>
              <Checkbox label="Allow conflict (institutional exception)" hint="Saves despite clashes. The exception and the conflicts are recorded in the audit log." checked={form.allow_conflict} onChange={(v) => setForm({ ...form, allow_conflict: v })} />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" isLoading={saving}>{editing ? 'Save changes' : 'Save period'}</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!del}
        danger
        title="Remove this timetable period?"
        message={del ? <>Remove <strong>{del.subject?.code}</strong> on {del.day_of_week} {del.start_time}–{del.end_time} ({del.section_label})? If classes were already held, the entry is ended today and past attendance is preserved; otherwise it is deleted.</> : ''}
        confirmLabel="Remove"
        isLoading={deleting}
        onConfirm={doDelete}
        onClose={() => setDel(null)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

const GridView: React.FC<{
  lk: Lookups;
  sectionId: string;
  setSectionId: (v: string) => void;
  tick: number;
  onAdd: (day: string) => void;
  onEdit: (e: ScheduleEntry) => void;
  onDelete: (e: ScheduleEntry) => void;
}> = ({ lk, sectionId, setSectionId, tick, onAdd, onEdit, onDelete }) => {
  const entries = useApi<ScheduleEntry[]>(sectionId ? '/timetable' + qs({ section_id: sectionId, _t: tick }) : null);
  const breaks = useApi<BreakItem[]>('/timetable/breaks' + qs({ _t: tick }));
  const sectionBreaks = (breaks.data || []).filter((b) => b.section_id === null || String(b.section_id) === sectionId);

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Select label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} placeholder={lk.sections.length ? undefined : 'No sections'} options={lk.sections.map((s) => ({ value: String(s.id), label: s.label }))} />
      </div>
      {!sectionId ? (
        <EmptyState title="No section selected" description="Create sections in Academic management first." />
      ) : entries.error ? (
        <ErrorState message={entries.error} onRetry={entries.reload} />
      ) : entries.loading && !entries.data ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{WEEKDAYS.map((d) => <Skeleton key={d} className="h-48 rounded-xl" />)}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {WEEKDAYS.map((day) => {
            const items = (entries.data || []).filter((e) => e.day_of_week === day);
            const brk = sectionBreaks.filter((b) => b.day_of_week === day);
            const slots = [
              ...items.map((e) => ({ kind: 'class' as const, start: e.start_time, e })),
              ...brk.map((b) => ({ kind: 'break' as const, start: b.start_time, b })),
            ].sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div key={day} className="rounded-xl border border-slate-200 bg-white flex flex-col min-h-[12rem]">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">{day}</span>
                  <button type="button" onClick={() => onAdd(day)} className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50" aria-label={`Add period on ${day}`}><Plus className="w-3.5 h-3.5" /></button>
                </div>
                <div className="p-2 space-y-2 flex-1">
                  {slots.length === 0 && <p className="text-[11px] text-slate-400 text-center py-6">No classes</p>}
                  {slots.map((s) =>
                    s.kind === 'break' ? (
                      <div key={`b${s.b.id}`} className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-2 py-1.5 text-[11px] text-amber-800 flex items-center gap-1.5">
                        <Coffee className="w-3 h-3" /> {s.b.label} · {s.b.start_time}–{s.b.end_time}
                      </div>
                    ) : (
                      <div key={s.e.id} className={cn('group rounded-lg border px-2.5 py-2 text-xs', s.e.effective_from && s.e.effective_from > todayISO() ? 'border-dashed border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-slate-50/60')}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-bold text-blue-700">{s.e.subject?.code}</span>
                          <span className="font-mono text-[10px] text-slate-500">{s.e.start_time}–{s.e.end_time}</span>
                        </div>
                        <p className="text-slate-800 font-medium truncate" title={s.e.subject?.name}>{s.e.subject?.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{s.e.lecturer_name || '—'} · {s.e.room_number}</p>
                        {(s.e.effective_from || s.e.effective_to) && (
                          <p className="text-[10px] text-slate-500">{s.e.effective_from ? `from ${formatDate(s.e.effective_from)}` : ''}{s.e.effective_to ? ` until ${formatDate(s.e.effective_to)}` : ''}</p>
                        )}
                        <div className="mt-1 flex justify-end gap-1 opacity-70 group-hover:opacity-100">
                          <button type="button" onClick={() => onEdit(s.e)} className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-white" aria-label="Edit period"><Pencil className="w-3 h-3" /></button>
                          <button type="button" onClick={() => onDelete(s.e)} className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-white" aria-label="Delete period"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const ListView: React.FC<{ lk: Lookups; tick: number; onEdit: (e: ScheduleEntry) => void; onDelete: (e: ScheduleEntry) => void }> = ({ lk, tick, onEdit, onDelete }) => {
  const [f, setF] = useState({ department_id: '', section_id: '', subject_id: '', lecturer_id: '', day_of_week: '', include_inactive: false });
  const { data, loading, error, reload } = useApi<ScheduleEntry[]>('/timetable' + qs({ ...f, include_inactive: f.include_inactive || undefined, _t: tick }));
  const subjects = useMemo(() => (f.department_id ? lk.subjects.filter((s) => String(s.department_id) === f.department_id) : lk.subjects), [lk.subjects, f.department_id]);
  const today = todayISO();
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <FilterGrid>
          <Select label="Department" placeholder="All" value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value, subject_id: '' })} options={lk.departments.map((d) => ({ value: String(d.id), label: d.code }))} />
          <Select label="Section" placeholder="All" value={f.section_id} onChange={(e) => setF({ ...f, section_id: e.target.value })} options={lk.sections.map((s) => ({ value: String(s.id), label: s.label }))} />
          <Select label="Subject" placeholder="All" value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })} options={subjects.map((s) => ({ value: String(s.id), label: s.code }))} />
          <Select label="Lecturer" placeholder="All" value={f.lecturer_id} onChange={(e) => setF({ ...f, lecturer_id: e.target.value })} options={lk.lecturers.map((l) => ({ value: String(l.id), label: l.user?.full_name || l.employee_id }))} />
          <Select label="Day" placeholder="All" value={f.day_of_week} onChange={(e) => setF({ ...f, day_of_week: e.target.value })} options={WEEKDAYS.map((d) => ({ value: d, label: d }))} />
          <div className="pb-2"><Checkbox label="Include ended / past versions" checked={f.include_inactive} onChange={(v) => setF({ ...f, include_inactive: v })} /></div>
        </FilterGrid>
      </Card>
      <Card className="p-0 overflow-hidden">
        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <TableSkeleton rows={6} cols={7} />
        ) : !data || data.length === 0 ? (
          <div className="p-5"><EmptyState icon={<CalendarDays className="w-5 h-5" />} title="No timetable periods" description="No periods match these filters." /></div>
        ) : (
          <Table>
            <thead><tr><Th>Day</Th><Th>Time</Th><Th>Subject</Th><Th>Section</Th><Th>Lecturer</Th><Th>Room</Th><Th>Effective</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {data.map((e) => {
                const ended = !e.is_active || (e.effective_to !== null && e.effective_to < today);
                const future = e.effective_from !== null && e.effective_from > today;
                return (
                  <tr key={e.id} className={cn('hover:bg-slate-50/70', ended && 'opacity-60')}>
                    <Td className="text-xs">{e.day_of_week}</Td>
                    <Td className="font-mono text-xs whitespace-nowrap"><Clock className="inline w-3 h-3 mr-1 text-slate-400" />{e.start_time}–{e.end_time}</Td>
                    <Td><span className="font-mono text-xs font-semibold text-blue-700">{e.subject?.code}</span><div className="text-[11px] text-slate-500">{e.subject?.name}</div></Td>
                    <Td className="text-xs">{e.section_label}</Td>
                    <Td className="text-xs"><User className="inline w-3 h-3 mr-1 text-slate-400" />{e.lecturer_name || '—'}</Td>
                    <Td className="text-xs"><MapPin className="inline w-3 h-3 mr-1 text-slate-400" />{e.room_number}</Td>
                    <Td className="text-xs whitespace-nowrap">
                      {e.effective_from ? formatDate(e.effective_from) : 'Always'} → {e.effective_to ? formatDate(e.effective_to) : 'open'}
                      {ended && <Badge variant="neutral" className="ml-1">Ended</Badge>}
                      {future && <Badge variant="info" className="ml-1">Upcoming</Badge>}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {!ended && (
                        <>
                          <Button size="sm" variant="ghost" aria-label="Edit period" onClick={() => onEdit(e)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" aria-label="Delete period" className="text-rose-600" onClick={() => onDelete(e)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// This week (concrete sessions)
// ---------------------------------------------------------------------------

const WeekView: React.FC<{ lk: Lookups; tick: number }> = ({ lk, tick }) => {
  const [start, setStart] = useState(() => mondayOf(todayISO()));
  const [sectionId, setSectionId] = useState('');
  const { data, loading, error, reload } = useApi<{ start: string; end: string; sessions: WeekSession[] }>('/timetable/week' + qs({ start, section_id: sectionId, _t: tick }));
  const days = WEEKDAYS.map((d, i) => ({ day: d, date: addDays(start, i) }));
  const today = todayISO();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setStart(mondayOf(todayISO()))}>This week</Button>
          <Button variant="outline" size="sm" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <p className="text-sm font-medium text-slate-700 pb-1.5">{formatDate(start)} – {formatDate(addDays(start, 6))}</p>
        <div className="w-64 ml-auto">
          <Select label="Section" placeholder="All sections" value={sectionId} onChange={(e) => setSectionId(e.target.value)} options={lk.sections.map((s) => ({ value: String(s.id), label: s.label }))} />
        </div>
      </div>
      <p className="text-[11px] text-slate-500">Concrete class sessions generated from the timetable, including cancellations (cancel or restore sessions from Attendance records → Sessions).</p>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{WEEKDAYS.map((d) => <Skeleton key={d} className="h-40 rounded-xl" />)}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {days.map(({ day, date }) => {
            const items = (data?.sessions || []).filter((s) => s.date === date);
            return (
              <div key={date} className={cn('rounded-xl border bg-white min-h-[10rem]', date === today ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200')}>
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-700">{day}</p>
                  <p className="text-[11px] text-slate-500">{formatDate(date)}</p>
                </div>
                <div className="p-2 space-y-2">
                  {items.length === 0 && <p className="text-[11px] text-slate-400 text-center py-4">No classes</p>}
                  {items.map((s) => (
                    <div key={s.id} className={cn('rounded-lg border px-2.5 py-2 text-xs', s.status === 'CANCELLED' ? 'border-slate-200 bg-slate-100/70' : 'border-slate-200 bg-slate-50/60')}>
                      <div className="flex items-center justify-between gap-1">
                        <span className={cn('font-mono font-bold', s.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-blue-700')}>{s.subject_code}</span>
                        <span className="font-mono text-[10px] text-slate-500">{s.start_time}–{s.end_time}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{s.lecturer_name || '—'} · {s.room_number}</p>
                      {!sectionId && <p className="text-[10px] text-slate-400 truncate">{s.section}</p>}
                      {s.status === 'CANCELLED' && <p className="mt-1 text-[10px] font-medium text-rose-600">Cancelled{s.cancel_reason ? `: ${s.cancel_reason}` : ''}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Breaks
// ---------------------------------------------------------------------------

const BreaksView: React.FC<{ lk: Lookups }> = ({ lk }) => {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<BreakItem[]>('/timetable/breaks');
  const [form, setForm] = useState({ section_id: '', day_of_week: 'Monday', start_time: '11:15', end_time: '11:30', label: 'Break' });
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [del, setDel] = useState<BreakItem | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (form.start_time >= form.end_time) return setFormErr('Start time must be before end time.');
    setBusy(true);
    try {
      await ApiClient.post('/timetable/breaks', { ...form, section_id: form.section_id ? Number(form.section_id) : null, label: form.label.trim() || 'Break' });
      toast.success('Break added');
      reload();
    } catch (err) {
      setFormErr(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      const res = await ApiClient.delete<{ message: string }>(`/timetable/breaks/${del.id}`);
      toast.success(res.message || 'Break removed');
      setDel(null);
      reload();
    } catch (e) {
      toast.error('Could not remove break', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3 items-start">
      <Card>
        <CardTitle>Add break</CardTitle>
        <CardDescription className="mb-4">Classes cannot be scheduled during a break (unless an exception is allowed).</CardDescription>
        <form onSubmit={add} className="space-y-3">
          {formErr && <InlineAlert tone="danger">{formErr}</InlineAlert>}
          <Select label="Section" placeholder="All sections" value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })} options={lk.sections.map((s) => ({ value: String(s.id), label: s.label }))} />
          <Select label="Day" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })} options={WEEKDAYS.map((d) => ({ value: d, label: d }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            <Input label="End" type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <Input label="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Lunch" />
          <div className="flex justify-end"><Button type="submit" size="sm" isLoading={busy} leftIcon={<Plus className="w-3.5 h-3.5" />}>Add break</Button></div>
        </form>
      </Card>
      <Card className="p-0 overflow-hidden lg:col-span-2">
        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <TableSkeleton rows={4} cols={4} />
        ) : !data || data.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Coffee className="w-5 h-5" />} title="No breaks defined" description="Add recurring breaks such as lunch to block those times." /></div>
        ) : (
          <Table>
            <thead><tr><Th>Day</Th><Th>Time</Th><Th>Label</Th><Th>Applies to</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {data.slice().sort((a, b) => WEEKDAYS.indexOf(a.day_of_week as typeof WEEKDAYS[number]) - WEEKDAYS.indexOf(b.day_of_week as typeof WEEKDAYS[number]) || a.start_time.localeCompare(b.start_time)).map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/70">
                  <Td className="text-xs">{b.day_of_week}</Td>
                  <Td className="font-mono text-xs">{b.start_time}–{b.end_time}</Td>
                  <Td className="text-xs">{b.label}</Td>
                  <Td className="text-xs">{b.section_label}</Td>
                  <Td className="text-right"><Button size="sm" variant="ghost" className="text-rose-600" aria-label="Remove break" onClick={() => setDel(b)}><Trash2 className="w-3.5 h-3.5" /></Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <ConfirmDialog isOpen={!!del} danger title="Remove break?" message={del ? `${del.label} on ${del.day_of_week} ${del.start_time}–${del.end_time} (${del.section_label})` : ''} confirmLabel="Remove" isLoading={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  );
};
