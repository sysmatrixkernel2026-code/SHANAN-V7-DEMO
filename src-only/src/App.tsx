import { Routes, Route } from 'react-router-dom';
import { SupplyRequestProvider } from './context/SupplyRequestContext';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import AdminLayout from './components/AdminLayout';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import ProductDetails from './pages/ProductDetails';
import Categories from './pages/Categories';
import Brands from './pages/Brands';
import SupplyRequest from './pages/SupplyRequest';
import SupplyRequestsAdmin from './pages/SupplyRequestsAdmin';
import SuppliersAdmin from './pages/SuppliersAdmin';
import AgreementsAdmin from './pages/AgreementsAdmin';
import AgreementDetail from './pages/AgreementDetail';
import RfqsAdmin from './pages/RfqsAdmin';
import RfqDetail from './pages/RfqDetail';
import RfqComparison from './pages/RfqComparison';
import SourcingEvaluation from './pages/SourcingEvaluation';
import ProductsAdmin from './pages/ProductsAdmin';
import OpportunitiesAdmin from './pages/OpportunitiesAdmin';
import FollowUpTasksAdmin from './pages/FollowUpTasksAdmin';
import PurchaseRequestsAdmin from './pages/PurchaseRequestsAdmin';
import PurchaseOrdersAdmin from './pages/PurchaseOrdersAdmin';
import About from './pages/About';
import Contact from './pages/Contact';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/portal/Login';
import PortalLayout from './pages/portal/PortalLayout';
import MyRequests from './pages/portal/MyRequests';
import RequestDetails from './pages/portal/RequestDetails';
import NewRequest from './pages/portal/NewRequest';
import MyCompany from './pages/portal/MyCompany';
import SupplierLayout from './pages/supplier/SupplierLayout';
import SupplierDashboard from './pages/supplier/SupplierDashboard';
import SupplierProfile from './pages/supplier/SupplierProfile';
import SupplierRfqs from './pages/supplier/SupplierRfqs';
import SupplierRfqDetail from './pages/supplier/SupplierRfqDetail';
import SupplierProducts from './pages/supplier/SupplierProducts';
import SupplierNotifications from './pages/supplier/SupplierNotifications';
import SupplierAgreements from './pages/supplier/SupplierAgreements';
import SupplierAgreementDetail from './pages/supplier/SupplierAgreementDetail';
import SupplierRegister from './pages/supplier/SupplierRegister';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <AuthProvider>
      <SupplyRequestProvider>
        <ScrollToTop />
        <div className="app-layout">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<><Header /><main className="app-main"><Home /></main><Footer /></>} />
            <Route path="/catalog" element={<><Header /><main className="app-main"><Catalog /></main><Footer /></>} />
            <Route path="/product/:id" element={<><Header /><main className="app-main"><ProductDetails /></main><Footer /></>} />
            <Route path="/categories" element={<><Header /><main className="app-main"><Categories /></main><Footer /></>} />
            <Route path="/brands" element={<><Header /><main className="app-main"><Brands /></main><Footer /></>} />
            <Route path="/supply-request" element={<><Header /><main className="app-main"><SupplyRequest /></main><Footer /></>} />
            <Route path="/about" element={<><Header /><main className="app-main"><About /></main><Footer /></>} />
            <Route path="/contact" element={<><Header /><main className="app-main"><Contact /></main><Footer /></>} />

            {/* Auth route */}
            <Route path="/login" element={<Login />} />
            <Route path="/supplier/register" element={<SupplierRegister />} />

            {/* Admin / Internal — dedicated layout (no public Header) */}
            <Route path="/admin" element={<ProtectedRoute requireInternal><AdminLayout /></ProtectedRoute>}>
              <Route path="supply-requests" element={<SupplyRequestsAdmin />} />
              <Route path="suppliers" element={<SuppliersAdmin />} />
              <Route path="agreements" element={<AgreementsAdmin />} />
              <Route path="agreements/:id" element={<AgreementDetail />} />
              <Route path="rfqs" element={<RfqsAdmin />} />
              <Route path="rfqs/:id" element={<RfqDetail />} />
              <Route path="rfqs/:id/comparison" element={<RfqComparison />} />
              <Route path="supply-requests/:id/sourcing" element={<SourcingEvaluation />} />
              <Route path="purchase-requests" element={<PurchaseRequestsAdmin />} />
              <Route path="purchase-orders" element={<PurchaseOrdersAdmin />} />
              <Route path="purchase-orders/:id" element={<PurchaseOrdersAdmin />} />
              <Route path="products" element={<ProductsAdmin />} />
              <Route path="opportunities" element={<OpportunitiesAdmin />} />
              <Route path="tasks" element={<FollowUpTasksAdmin />} />
            </Route>

            {/* Customer Portal (protected) */}
            <Route path="/portal" element={<ProtectedRoute><PortalLayout /></ProtectedRoute>}>
              <Route path="my-requests" element={<MyRequests />} />
              <Route path="request/:id" element={<RequestDetails />} />
              <Route path="new-request" element={<NewRequest />} />
              <Route path="my-company" element={<MyCompany />} />
            </Route>

            {/* Supplier Portal (protected) */}
            <Route path="/supplier" element={<ProtectedRoute requireSupplier><SupplierLayout /></ProtectedRoute>}>
              <Route path="dashboard" element={<SupplierDashboard />} />
              <Route path="products" element={<SupplierProducts />} />
              <Route path="profile" element={<SupplierProfile />} />
              <Route path="rfqs" element={<SupplierRfqs />} />
              <Route path="rfqs/:id" element={<SupplierRfqDetail />} />
              <Route path="notifications" element={<SupplierNotifications />} />
              <Route path="agreements" element={<SupplierAgreements />} />
              <Route path="agreements/:id" element={<SupplierAgreementDetail />} />
            </Route>

            {/* Catch-all: Not Found */}
            <Route path="*" element={<><Header /><main className="app-main"><NotFound /></main><Footer /></>} />
          </Routes>
        </div>
      </SupplyRequestProvider>
    </AuthProvider>
  );
}
