import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Teachers from './Teachers';
import Students from './Students';
import BulkImport from './BulkImport';
import Masters from './Masters';

const TABS = [
  ['teachers', 'Teachers'],
  ['students', 'Students'],
  ['import', 'Bulk Import'],
  ['masters', 'Masters'],
];

export default function Admin() {
  return (
    <div className="page">
      <div className="tabs">
        {TABS.map(([p, l]) => (
          <NavLink key={p} to={`/admin/${p}`} className={({ isActive }) => `tab ${isActive ? 'tab-on' : ''}`}>{l}</NavLink>
        ))}
      </div>
      <Routes>
        <Route path="teachers" element={<Teachers />} />
        <Route path="students" element={<Students />} />
        <Route path="import" element={<BulkImport />} />
        <Route path="masters" element={<Masters />} />
        <Route path="*" element={<Navigate to="teachers" replace />} />
      </Routes>
    </div>
  );
}
