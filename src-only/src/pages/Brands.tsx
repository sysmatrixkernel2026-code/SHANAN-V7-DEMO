import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Brands() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/catalog', { replace: true });
  }, [navigate]);
  return null;
}
