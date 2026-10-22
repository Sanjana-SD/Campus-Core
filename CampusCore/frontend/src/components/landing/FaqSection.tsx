import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Container, SectionHeader } from './Primitives';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How is attendance calculated?',
    a: 'For each scheduled class in the timetable, Campus Core compares the class start and end time with the student’s actual recorded entry and exit times. The time present is divided by the scheduled duration. For a 09:00–10:00 class with entry at 09:10 and exit at 10:00, that is 50 of 60 minutes, or 83.33%. The final status, such as Present, Late or Partial, is then decided by your configured attendance policy.',
  },
  {
    q: 'Is attendance just a count of RFID scans?',
    a: 'No. Scan counts cannot show how long a student stayed in class. Campus Core uses the recorded entry and exit times for each scheduled class, so a student who leaves early is recorded accurately.',
  },
  {
    q: 'What happens if a student has no exit scan?',
    a: 'By default the record is flagged as pending verification so an authorised staff member can review it. It is never assumed to be present. If your college prefers, the policy can instead treat a missing exit as absent.',
  },
  {
    q: 'Do we need to change our RFID hardware?',
    a: 'No. Campus Core connects to your existing RFID attendance data source. There are no readers to replace and no firmware changes required.',
  },
  {
    q: 'Can the grace period and attendance thresholds be configured?',
    a: 'Yes. Administrators configure the attendance policy, including the grace period for late entry and the thresholds used to decide each status.',
  },
  {
    q: 'Who can see placement data?',
    a: 'Placement officers and administrators manage drives, applications and outcomes. Students see the drives they are eligible for and their own applications and results, not other students’ data.',
  },
  {
    q: 'How is student data kept private?',
    a: 'Access is role-based and enforced on the server: students see only their own records, lecturers see the classes and subjects assigned to them, and administrators manage institutional configuration. Passwords are stored as secure hashes and sessions use signed tokens.',
  },
  {
    q: 'Can students register themselves?',
    a: 'No. Accounts are created by the college administration. If you need access, contact your administration office.',
  },
];

export const FaqSection: React.FC = () => {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-[72px] border-t border-slate-200 bg-slate-50 py-20 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeader
            id="faq-heading"
            eyebrow="FAQ"
            title="Frequently asked questions"
            description="Answers to the questions colleges ask most about attendance, hardware, placements and privacy."
          />
        </div>
        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            const btnId = `${baseId}-q-${i}`;
            const panelId = `${baseId}-a-${i}`;
            return (
              <div key={f.q}>
                <h3>
                  <button
                    id={btnId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-6 sm:py-5"
                  >
                    <span>{f.q}</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-transform duration-300',
                        isOpen && 'rotate-180 border-blue-200 bg-blue-50 text-blue-700'
                      )}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  hidden={!isOpen}
                  className="px-5 pb-5 text-sm leading-relaxed text-slate-600 sm:px-6"
                >
                  {f.a}
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
};
