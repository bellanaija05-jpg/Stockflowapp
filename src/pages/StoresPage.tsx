import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Store, StoreStatus } from '../types';
import { storage } from '../db/storageEngine';
import { AccessDenied } from '../components/common/AccessDenied';
import {
  Store as StoreIcon,
  Plus,
  Edit2,
  MapPin,
  Phone,
  Calendar,
  Search,
  CheckCircle2,
  XCircle,
  X,
  Users,
} from 'lucide-react';

interface StoresPageProps {
  onNavigateHome: () => void;
}

export const StoresPage: React.FC<StoresPageProps> = ({ onNavigateHome }) => {
  const { isAdmin, stores, users, refreshUserData, currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StoreStatus>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    phone: '',
    status: 'ACTIVE' as StoreStatus,
  });
  const [errorMessage, setErrorMessage] = useState('');

  if (!isAdmin) {
    return <AccessDenied requiredRole="Super Admin" onGoBack={onNavigateHome} />;
  }

  const filteredStores = stores.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getAttendantCount = (storeId: string) => {
    return users.filter((u) => u.assignedStoreId === storeId && u.status === 'ACTIVE').length;
  };

  const openCreateModal = () => {
    setEditingStore(null);
    setFormData({
      name: `Store ${stores.length + 1}`,
      location: '',
      phone: '+234 ',
      status: 'ACTIVE',
    });
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const openEditModal = (store: Store) => {
    setEditingStore(store);
    setFormData({
      name: store.name,
      location: store.location,
      phone: store.phone,
      status: store.status,
    });
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMessage('Store name is required.');
      return;
    }
    if (!formData.location.trim()) {
      setErrorMessage('Store physical location is required.');
      return;
    }

    const now = new Date().toISOString();

    if (editingStore) {
      // Update Store
      const updated: Store = {
        ...editingStore,
        name: formData.name.trim(),
        location: formData.location.trim(),
        phone: formData.phone.trim(),
        status: formData.status,
        updatedAt: now,
      };
      storage.saveStore(updated);

      // Audit Log
      storage.addAuditLog({
        id: `aud-${Date.now()}`,
        userId: currentUser?.id || 'admin',
        userName: currentUser?.name || 'Super Admin',
        userRole: 'ADMIN',
        action: 'STORE_UPDATED',
        entity: 'Store',
        entityId: updated.id,
        details: `Updated store "${updated.name}" (${updated.location}) - Status: ${updated.status}`,
        createdAt: now,
      });
    } else {
      // Create Store
      const newId = `store-${Date.now().toString().slice(-4)}`;
      const newStore: Store = {
        id: newId,
        name: formData.name.trim(),
        location: formData.location.trim(),
        phone: formData.phone.trim(),
        status: formData.status,
        createdAt: now,
        updatedAt: now,
      };
      storage.saveStore(newStore);

      // Audit Log
      storage.addAuditLog({
        id: `aud-${Date.now()}`,
        userId: currentUser?.id || 'admin',
        userName: currentUser?.name || 'Super Admin',
        userRole: 'ADMIN',
        action: 'STORE_CREATED',
        entity: 'Store',
        entityId: newStore.id,
        details: `Provisioned new retail branch "${newStore.name}" located at ${newStore.location}`,
        createdAt: now,
      });
    }

    refreshUserData();
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Stores Management</h2>
          <p className="text-xs text-slate-400">
            Configure multi-store retail branches, addresses, and physical locations
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Store Branch</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Retail Branches</span>
            <StoreIcon className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">{stores.length} Stores</div>
          <p className="text-[11px] text-slate-500 mt-1">Multi-branch enterprise setup</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Active Stores</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {stores.filter((s) => s.status === 'ACTIVE').length} Active
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Operational POS terminals</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Inactive Stores</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-slate-300 mt-1">
            {stores.filter((s) => s.status === 'INACTIVE').length} Inactive
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Suspended or maintenance</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search stores by name, city, location or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | StoreStatus)}
            className="bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-emerald-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Stores Grid Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-semibold">Store ID / Code</th>
                <th className="px-4 py-3 font-semibold">Branch Name</th>
                <th className="px-4 py-3 font-semibold">Location Address</th>
                <th className="px-4 py-3 font-semibold">Phone Contact</th>
                <th className="px-4 py-3 font-semibold">Attendants</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredStores.map((store) => {
                const attendants = getAttendantCount(store.id);
                return (
                  <tr key={store.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                      {store.id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white flex items-center gap-2">
                        <StoreIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{store.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>Created {new Date(store.createdAt).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-300 max-w-xs truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{store.location}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span>{store.phone || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-slate-300 bg-slate-800 px-2 py-0.5 rounded-md font-medium text-[11px]">
                        <Users className="w-3 h-3 text-indigo-400" />
                        {attendants} {attendants === 1 ? 'Attendant' : 'Attendants'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {store.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          ACTIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          <XCircle className="w-3 h-3" />
                          INACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEditModal(store)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title="Edit store"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredStores.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">
                    No stores found matching your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Store Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <StoreIcon className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  {editingStore ? `Edit ${editingStore.name}` : 'Create New Store Branch'}
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
                  Branch / Store Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Store 12 (Ikeja City Mall)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Physical Location / Address *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shop 24, Ikeja City Mall, Alausa, Lagos"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Contact Phone Number
                </label>
                <input
                  type="text"
                  placeholder="+234 802 000 0000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Operational Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as StoreStatus })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="ACTIVE">ACTIVE (Accepts Sales &amp; Inventory)</option>
                  <option value="INACTIVE">INACTIVE (Temporarily Closed)</option>
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
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  {editingStore ? 'Save Changes' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
