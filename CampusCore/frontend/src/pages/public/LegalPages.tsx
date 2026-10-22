import React from 'react';
import { Navbar } from '../../components/Navbar';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="font-landing min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 focus:outline-none">
        <Link to="/" className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-500 hover:text-blue-700 mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        <div className="bg-white p-6 sm:p-10 rounded-2xl border border-slate-200 shadow-sm prose prose-slate max-w-none text-slate-700 text-sm leading-relaxed space-y-4">
          <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-xs text-slate-500">Effective Date: October 20, 2026</p>

          <h2 className="font-display text-lg font-bold text-slate-900 mt-8">1. Scope of Privacy Policy</h2>
          <p>
            Campus Core ("the Platform") is designed for engineering colleges and higher education institutions to manage academic records and RFID attendance. This policy details how student and staff information is handled, synchronized, and safeguarded.
          </p>

          <h2 className="font-display text-lg font-bold text-slate-900 mt-8">2. Data Collection & RFID Processing</h2>
          <p>
            The platform processes student registration identifiers (USN, roll numbers), academic records, and RFID smart card Unique Identifiers (UIDs). Attendance intervals (Entry Time, Exit Time, and computed durations) are synchronized from authorized institution spreadsheets and hardware readers.
          </p>

          <h2 className="font-display text-lg font-bold text-slate-900 mt-8">3. Role-Based Access Control & Confidentiality</h2>
          <p>
            Access to academic records is governed by strict server-side authorization:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Students:</strong> Access only their own attendance history, enrolled timetables, assignments, and published marks.</li>
            <li><strong>Lecturers:</strong> Access only classes and subjects assigned to their academic schedule.</li>
            <li><strong>Placement Officers:</strong> Access placement drives, applications, and outcomes required to coordinate recruitment.</li>
            <li><strong>Administrators:</strong> Hold authorized privileges to manage institutional configuration, sync queues, and user directories.</li>
          </ul>

          <h2 className="font-display text-lg font-bold text-slate-900 mt-8">4. Data Security</h2>
          <p>
            All user authentication tokens utilize industry-standard cryptographic algorithms (HS256 JWT) and password hashing with bcrypt. Integration webhooks require shared secret headers to prevent unauthorized ingestion.
          </p>
        </div>
      </main>
    </div>
  );
};

export const TermsOfService: React.FC = () => {
  return (
    <div className="font-landing min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 focus:outline-none">
        <Link to="/" className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-500 hover:text-blue-700 mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        <div className="bg-white p-6 sm:p-10 rounded-2xl border border-slate-200 shadow-sm prose prose-slate max-w-none text-slate-700 text-sm leading-relaxed space-y-4">
          <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
          <p className="text-xs text-slate-500">Effective Date: October 20, 2026</p>

          <h2 className="font-display text-lg font-bold text-slate-900 mt-8">1. Acceptance of Terms</h2>
          <p>
            By accessing or operating the Campus Core platform, authorized personnel, faculty, and enrolled students agree to comply with institution academic regulations and system policies.
          </p>

          <h2 className="font-display text-lg font-bold text-slate-900 mt-8">2. Attendance Integrity Policy</h2>
          <p>
            Official attendance calculations are derived through authorized RFID hardware taps and verified class sessions according to college regulations (default 75% threshold). Unauthorized card possession or attempting to falsify attendance taps is strictly prohibited.
          </p>

          <h2 className="font-display text-lg font-bold text-slate-900 mt-8">3. Account Responsibility</h2>
          <p>
            Users are responsible for maintaining the confidentiality of their credentials and must promptly notify administrators if unauthorized access is suspected.
          </p>
        </div>
      </main>
    </div>
  );
};
