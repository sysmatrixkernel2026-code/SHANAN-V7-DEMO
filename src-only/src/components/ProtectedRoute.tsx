import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireInternal?: boolean;
  requireSupplier?: boolean;
}

export default function ProtectedRoute({ children, requireInternal = false, requireSupplier = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <div className="portal-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }} />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireInternal && user?.userType !== 'internal') {
    return <Navigate to={user?.userType === 'supplier' ? '/supplier/dashboard' : '/portal/my-requests'} replace />;
  }
  if (requireSupplier && user?.userType !== 'supplier') {
    return <Navigate to={user?.userType === 'internal' ? '/admin/supply-requests' : '/portal/my-requests'} replace />;
  }
  return <>{children}</>;
}
