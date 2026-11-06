import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AddTxProvider } from './components/AddTx';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import Accounts from './pages/Accounts';
import Close from './pages/Close';
import History from './pages/History';
import Methods from './pages/Methods';
import Home from './pages/Home';
import Login from './pages/Login';
import Settings from './pages/Settings';
import Users from './pages/Users';
import { StoreProvider } from './store';

function Protected() {
  return (
    <StoreProvider>
      <AddTxProvider>
        <div className="shell">
          <Sidebar />
          <main className="main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/history" element={<History />} />
              <Route path="/close" element={<Close />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/methods" element={<Methods />} />
              <Route path="/users" element={<Users />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <TabBar />
        </div>
      </AddTxProvider>
    </StoreProvider>
  );
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={user ? <Protected /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
