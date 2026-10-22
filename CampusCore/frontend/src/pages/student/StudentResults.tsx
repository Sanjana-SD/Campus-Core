import React, { useState, useEffect } from 'react';
import { Award, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiClient } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const StudentResults: React.FC = () => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        const res = await ApiClient.get<any[]>('/exams/my-results');
        setResults(res || []);
      } catch (err) {
        console.error('Error fetching results:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, []);

  if (loading) {
    return <LoadingSpinner message="Fetching your published academic marks..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link to="/student" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Internal Assessment Marks & Results</h1>
        <p className="text-xs text-slate-500 mt-1">
          Official grades and evaluator feedback published by your college academic department.
        </p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <CardTitle>Evaluation Ledger</CardTitle>
          <CardDescription>Verified examination scores and examiner feedback</CardDescription>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Evaluation Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4">Percentage</th>
                <th className="py-3 px-4">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No results have been officially published for your enrolled subjects yet.
                  </td>
                </tr>
              ) : (
                results.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>{r.subject_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{r.subject_code}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{r.exam_name}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{r.exam_type}</td>
                    <td className="py-3 px-4 font-mono font-bold text-blue-700">
                      {r.marks_obtained} / {r.max_marks}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900">{r.percentage}%</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 italic">{r.remarks || 'Satisfactory'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
