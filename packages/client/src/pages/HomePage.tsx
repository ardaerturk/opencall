import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button';
import styles from './HomePage.module.css';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [joinRoomId, setJoinRoomId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateMeeting = async () => {
    setIsCreating(true);
    try {
      // Generate a random room ID
      const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      navigate(`/meeting/${roomId}`);
    } catch (error) {
      console.error('Failed to create meeting:', error);
      alert('Failed to create meeting. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinRoomId.trim()) {
      navigate(`/meeting/${joinRoomId.trim()}`);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>OpenCall</h1>
          <p className={styles.subtitle}>Secure, peer-to-peer video conferencing</p>
        </header>

        <div className={styles.actions}>
          <div className={styles.actionCard}>
            <h2>Start a new meeting</h2>
            <p>Create a meeting and invite others to join</p>
            <Button 
              variant="primary" 
              size="large"
              onClick={handleCreateMeeting}
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Meeting'}
            </Button>
          </div>

          <div className={styles.divider}>
            <span>OR</span>
          </div>

          <div className={styles.actionCard}>
            <h2>Join a meeting</h2>
            <p>Enter a meeting ID to join an existing call</p>
            <form onSubmit={handleJoinMeeting} className={styles.joinForm}>
              <input
                type="text"
                placeholder="Enter meeting ID"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                className={styles.input}
                required
              />
              <Button 
                type="submit" 
                variant="secondary" 
                size="large"
                disabled={!joinRoomId.trim()}
              >
                Join Meeting
              </Button>
            </form>
          </div>
        </div>

        <footer className={styles.footer}>
          <p>No downloads or plugins required. Works in your browser.</p>
        </footer>
      </div>
    </div>
  );
};