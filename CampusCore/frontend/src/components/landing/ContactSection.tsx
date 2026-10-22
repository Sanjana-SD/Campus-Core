import React, { useState } from 'react';
import { Building, Loader2, Send } from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { cn, errorMessage } from '../../lib/utils';
import { useToast } from '../ui/Toast';
import { Container, SectionHeader } from './Primitives';

type Field = 'name' | 'email' | 'subject' | 'message';
type FormState = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const EMPTY: FormState = { name: '', email: '', subject: '', message: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(v: FormState): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = 'Please enter your name.';
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Please enter a valid email address.';
  if (v.subject.trim().length < 3) e.subject = 'Please add a short subject.';
  if (v.message.trim().length < 10) e.message = 'Please write at least 10 characters.';
  else if (v.message.length > 2000) e.message = 'Please keep your message under 2000 characters.';
  return e;
}

const inputBase =
  'block w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-xs transition focus:outline-none focus:ring-4';

export const ContactSection: React.FC = () => {
  const toast = useToast();
  const [values, setValues] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const update = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = { ...values, [field]: e.target.value };
    setValues(next);
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: validate(next)[field] }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    const firstInvalid = (Object.keys(found) as Field[])[0];
    if (firstInvalid) {
      document.getElementById(`contact-${firstInvalid}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await ApiClient.post('/contact', {
        name: values.name.trim(),
        email: values.email.trim(),
        subject: values.subject.trim(),
        message: values.message.trim(),
      });
      toast.success('Message sent', 'Thank you. The administration office will get back to you.');
      setValues(EMPTY);
      setErrors({});
    } catch (err) {
      toast.error('Could not send your message', errorMessage(err) || 'Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = (f: Field) =>
    cn(
      inputBase,
      errors[f]
        ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
        : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
    );

  const describedBy = (f: Field) => (errors[f] ? `contact-${f}-error` : undefined);

  const label = (f: Field, text: string) => (
    <label htmlFor={`contact-${f}`} className="mb-1.5 block text-sm font-medium text-slate-800">
      {text}
    </label>
  );

  const errorText = (f: Field) =>
    errors[f] ? (
      <p id={`contact-${f}-error`} className="mt-1.5 text-xs font-medium text-rose-600">
        {errors[f]}
      </p>
    ) : null;

  return (
    <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-[72px] bg-white py-20 sm:py-24">
      <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <SectionHeader
            id="contact-heading"
            eyebrow="Contact"
            title="Talk to us about your campus"
            description="Questions about deployment, connecting your RFID attendance data, or access for your department? Send a message and it will reach the right team."
          />
          <div data-reveal className="mt-8 flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 ring-1 ring-slate-200">
              <Building className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Reach the administration office</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Students and staff who need an account or a password reset should contact their college administration office
                directly. Accounts are not created through this form.
              </p>
            </div>
          </div>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          aria-labelledby="contact-heading"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/[0.04] sm:p-8"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              {label('name', 'Full name')}
              <input
                id="contact-name"
                name="name"
                autoComplete="name"
                value={values.name}
                onChange={update('name')}
                aria-invalid={!!errors.name}
                aria-describedby={describedBy('name')}
                className={fieldClass('name')}
                placeholder="Your name"
                maxLength={120}
              />
              {errorText('name')}
            </div>
            <div>
              {label('email', 'Email')}
              <input
                id="contact-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={values.email}
                onChange={update('email')}
                aria-invalid={!!errors.email}
                aria-describedby={describedBy('email')}
                className={fieldClass('email')}
                placeholder="name@college.edu"
                maxLength={160}
              />
              {errorText('email')}
            </div>
          </div>
          <div className="mt-5">
            {label('subject', 'Subject')}
            <input
              id="contact-subject"
              name="subject"
              value={values.subject}
              onChange={update('subject')}
              aria-invalid={!!errors.subject}
              aria-describedby={describedBy('subject')}
              className={fieldClass('subject')}
              placeholder="e.g. Connecting our RFID attendance data"
              maxLength={200}
            />
            {errorText('subject')}
          </div>
          <div className="mt-5">
            {label('message', 'Message')}
            <textarea
              id="contact-message"
              name="message"
              rows={5}
              value={values.message}
              onChange={update('message')}
              aria-invalid={!!errors.message}
              aria-describedby={describedBy('message')}
              className={cn(fieldClass('message'), 'resize-y')}
              placeholder="How can we help?"
              maxLength={2000}
            />
            {errorText('message')}
          </div>
          <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              We use your details only to respond to this message.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Sending…
                </>
              ) : (
                <>
                  Send message
                  <Send className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </form>
      </Container>
    </section>
  );
};
