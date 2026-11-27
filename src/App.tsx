import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './state/session';
import { Spinner } from './components/ui';
import { SecureRoom } from './components/secure/SecureRoom';
import Login from './pages/Login';
import Home from './pages/Home';
import NewDiagnosis from './pages/NewDiagnosis';
import SelfCheck from './pages/SelfCheck';
import Survey from './pages/Survey';
import Interview from './pages/Interview';
import Admin from './pages/Admin';
import RoomOverview from './pages/room/RoomOverview';
import RoomDesign from './pages/room/RoomDesign';
import RoomSurvey from './pages/room/RoomSurvey';
import RoomInterviews from './pages/room/RoomInterviews';
import RoomDocuments from './pages/room/RoomDocuments';
import RoomAnalysis from './pages/room/RoomAnalysis';
import RoomReport from './pages/room/RoomReport';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/self-check" element={<SelfCheck />} />
      <Route path="/s/:token" element={<Survey />} />
      <Route path="/i/:token" element={<Interview />} />
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/new" element={<RequireAuth><NewDiagnosis /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
      <Route path="/room/:id" element={<RequireAuth><SecureRoom /></RequireAuth>}>
        <Route index element={<RoomOverview />} />
        <Route path="design" element={<RoomDesign />} />
        <Route path="survey" element={<RoomSurvey />} />
        <Route path="interviews" element={<RoomInterviews />} />
        <Route path="documents" element={<RoomDocuments />} />
        <Route path="analysis" element={<RoomAnalysis />} />
        <Route path="report" element={<RoomReport />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
