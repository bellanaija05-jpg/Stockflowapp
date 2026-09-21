import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Role, UserStatus } from '../types';
import { storage } from '../db/storageEngine';
import { AccessDenied } from '../components/common/AccessDenied';
import {
  Users,
  Plus,
  Edit2,
  ShieldCheck,
  Store,
  Mail,
  CheckCircle2,
  XCircle,
  X,
  Search,
  UserCheck,
} from 'lucide-react';

interface UsersPageProps {
  onNavigateHome: () => void;
}

export const UsersPage: React.FC<UsersPageProps> = ({ onNavigateHome }) => {
  const { isAdmin, users, stores, refreshUserData, currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL');
  const [storeFilter, setStoreFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'ATTENDANT' as Role,
    assignedStoreId: stores[0]?.id || 'store-1',
    status: 'ACTIVE' as UserStatus,
  });
  const [errorMessage, setErrorMessage] = useState('');

  if (!isAdmin) {
    return <AccessDenied requiredRole="Super Admin" onGoBack={onNavigateHome} />;
  }

  const getStoreName = (storeId?: string) => {
    if (!storeId) return 'Enterprise Global (All)';
    const s = stores.find((st) => st.id === storeId);
    return s ? s.name : storeId;
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.assignedStoreId && getStoreName(u.assignedStoreId).toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchesStore = storeFilter === 'ALL' || u.assignedStoreId === storeFilter;
    return matchesSearch && matchesRole && matchesStore;
  });

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      role: 'ATTENDANT',
      assignedStoreId: stores[0]?.id || 'store-1',
      status: 'ACTIVE',
    });
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      assignedStoreId: user.assignedStoreId || stores[0]?.id || 'store-1',
      status: user.status,
    });
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMessage('Full name is required.');
      return;
    }
    if (!formData.email.trim()) {
      setErrorMessage('Email address is required.');
      return;
    }

    const now = new Date().toISOString();

    if (editingUser) {
      const updated: User = {
        ...editingUser,
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        assignedStoreId: formData.role === 'ATTENDANT' ? formData.assignedStoreId : undefined,
        status: formData.status,
        updatedAt: now,
      };
      storage.saveUser(updated);

      // Audit Log
      storage.addAuditLog({
        id: `aud-${Date.now()}`,
        userId: currentUser?.id || 'admin',
        userName: currentUser?.name || 'Super Admin',
        userRole: 'ADMIN',
        action: 'USER_UPDATED',
        entity: 'User',
        entityId: updated.id,
        details: `Updated user "${updated.name}" (${updated.email}) - Assigned Store: ${getStoreName(updated.assignedStoreId)} - Status: ${updated.status}`,
        createdAt: now,
      });
    } else {
      const newUser: User = {
        id: `user-${Date.now().toString().slice(-4)}`,
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        assignedStoreId: formData.role === 'ATTENDANT' ? formData.assignedStoreId : undefined,
        status: formData.status,
        createdAt: now,
        updatedAt: now,
      };
      storage.saveUser(newUser);

      // Audit Log
      storage.addAuditLog({
        id: `aud-${Date.now()}`,
        userId: currentUser?.id || 'admin',
        userName: currentUser?.name || 'Super Admin',
        userRole: 'ADMIN',
        action: 'USER_CREATED',
        entity: 'User',
        entityId: newUser.id,
        details: `Created new ${newUser.role} user "${newUser.name}" assigned to ${getStoreName(newUser.assignedStoreId)}`,
        createdAt: now,
      });
    }

    refreshUserData();
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Users &amp; Store Attendants</h2>
          <p className="text-xs text-slate-400">
            Manage staff credentials, store assignments, and role-based permissions
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-900/30 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Attendant / User</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Staff Accounts</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">{users.length} Users</div>
          <p className="text-[11px] text-slate-500 mt-1">Super Admins &amp; Store Attendants</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Active Attendants</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {users.filter((u) => u.role === 'ATTENDANT' && u.status === 'ACTIVE').length} Attendants
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Across physical branches</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Admin Accounts</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-300 mt-1">
            {users.filter((u) => u.role === 'ADMIN').length} Super Admin
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Full multi-store visibility</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search users by name, email, or store..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'ALL' | Role)}
            className="bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">Super Admins</option>
            <option value="ATTENDANT">Store Attendants</option>
          </select>

          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
          >
            <option value="ALL">All Stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Assigned Store</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                          user.role === 'ADMIN'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{user.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{user.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span>{user.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.role === 'ADMIN' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        <ShieldCheck className="w-3 h-3" />
                        SUPER ADMIN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <Store className="w-3 h-3" />
                        STORE ATTENDANT
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-200 font-medium">
                      {getStoreName(user.assignedStoreId)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.status === 'ACTIVE' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        ACTIVE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <XCircle className="w-3 h-3" />
                        INACTIVE
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEditModal(user)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      title="Edit user role and store assignment"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                    No users found matching your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  {editingUser ? `Edit ${editingUser.name}` : 'Create Staff Member'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-lg text-rose-300 text-xs">
                  {errorMessage}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tunde Balogun"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="tunde@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Account Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as Role })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="ATTENDANT">Store Attendant (Assigned to 1 Store)</option>
                  <option value="ADMIN">Super Admin (Global Enterprise Access)</option>
                </select>
              </div>

              {formData.role === 'ATTENDANT' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Assigned Store Branch *
                  </label>
                  <select
                    value={formData.assignedStoreId}
                    onChange={(e) => setFormData({ ...formData, assignedStoreId: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.location})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Attendants are strictly locked to their assigned store and cannot view other stores.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Account Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as UserStatus })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="ACTIVE">ACTIVE (Can log in and make sales)</option>
                  <option value="INACTIVE">INACTIVE (Access revoked)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
