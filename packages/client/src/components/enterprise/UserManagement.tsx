import React, { useState, useEffect, useCallback } from 'react';
import { EnterpriseUser, OrganizationFeatures } from '@opencall/core';
import { EnterpriseService } from '../../services/enterprise/EnterpriseService';
import styles from './UserManagement.module.css';

interface UserManagementProps {
  organizationId: string;
  features: OrganizationFeatures;
}

export const UserManagement: React.FC<UserManagementProps> = ({ organizationId, features }) => {
  const [users, setUsers] = useState<EnterpriseUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [totalUsers, setTotalUsers] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'role' | 'lastLogin'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const enterpriseService = EnterpriseService.getInstance();
  const usersPerPage = 20;

  useEffect(() => {
    loadUsers();
  }, [currentPage, searchTerm, selectedRole]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { users: userData, total } = await enterpriseService.getUsers({
        limit: usersPerPage,
        offset: (currentPage - 1) * usersPerPage,
        search: searchTerm,
        role: selectedRole,
      });
      setUsers(userData);
      setTotalUsers(total);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    setShowAddUser(true);
  };

  const handleDeleteUsers = async () => {
    if (selectedUsers.size === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedUsers.size} user(s)?`
    );

    if (!confirmed) return;

    try {
      for (const userId of selectedUsers) {
        await enterpriseService.deleteUser(userId);
      }
      setSelectedUsers(new Set());
      await loadUsers();
    } catch (error) {
      console.error('Failed to delete users:', error);
    }
  };

  const handleToggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUsers(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map(u => u.id)));
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    let aValue: any = a[sortBy];
    let bValue: any = b[sortBy];

    if (sortBy === 'lastLogin') {
      aValue = a.metadata.lastLoginAt || new Date(0);
      bValue = b.metadata.lastLoginAt || new Date(0);
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(totalUsers / usersPerPage);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2>User Management</h2>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{totalUsers}</span>
            <span className={styles.statLabel}>Total Users</span>
          </div>
          {features.maxUsers && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{features.maxUsers - totalUsers}</span>
              <span className={styles.statLabel}>Remaining Seats</span>
            </div>
          )}
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className={styles.roleFilter}
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="guest">Guest</option>
        </select>

        <div className={styles.actions}>
          {selectedUsers.size > 0 && (
            <button
              onClick={handleDeleteUsers}
              className={styles.deleteButton}
            >
              Delete {selectedUsers.size} User(s)
            </button>
          )}
          <button
            onClick={handleAddUser}
            className={styles.addButton}
            disabled={features.maxUsers && totalUsers >= features.maxUsers}
          >
            Add User
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading users...</div>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selectedUsers.size === users.length && users.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th onClick={() => {
                  setSortBy('name');
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                }}>
                  Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => {
                  setSortBy('email');
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                }}>
                  Email {sortBy === 'email' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => {
                  setSortBy('role');
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                }}>
                  Role {sortBy === 'role' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>SSO</th>
                <th onClick={() => {
                  setSortBy('lastLogin');
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                }}>
                  Last Login {sortBy === 'lastLogin' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map(user => (
                <tr key={user.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(user.id)}
                      onChange={() => handleToggleUserSelection(user.id)}
                    />
                  </td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`${styles.role} ${styles[user.role]}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    {user.ssoId ? (
                      <span className={styles.ssoEnabled}>Enabled</span>
                    ) : (
                      <span className={styles.ssoDisabled}>Disabled</span>
                    )}
                  </td>
                  <td>
                    {user.metadata.lastLoginAt
                      ? new Date(user.metadata.lastLoginAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td>
                    <button className={styles.actionButton}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onUserAdded={() => {
            setShowAddUser(false);
            loadUsers();
          }}
        />
      )}
    </div>
  );
};

// Add User Modal Component
const AddUserModal: React.FC<{
  onClose: () => void;
  onUserAdded: () => void;
}> = ({ onClose, onUserAdded }) => {
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'member' as 'admin' | 'member' | 'guest',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterpriseService = EnterpriseService.getInstance();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await enterpriseService.createUser(formData);
      onUserAdded();
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Add New User</h3>
        {error && <div className={styles.error}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({
                ...formData,
                role: e.target.value as 'admin' | 'member' | 'guest'
              })}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="guest">Guest</option>
            </select>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};