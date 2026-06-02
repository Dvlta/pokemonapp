import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { LoginPage, RegisterPage } from "./pages/AuthPage.jsx";
import { ProtectedRoute } from "./routes.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
