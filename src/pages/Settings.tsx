import { useState } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';

export function Settings() {
  const theme = useStore(state => state.theme);
  const setTheme = useStore(state => state.setTheme);
  const user = useStore(state => state.user);
  
  const [resetStatus, setResetStatus] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resetState, setResetState] = useState<'idle' | 'resetting' | 'success'>('idle');

  const executeFactoryReset = async () => {
    setResetState('resetting');
    try {
      await useStore.getState().clearAllData();
      setResetState('success');
      setTimeout(() => {
        setShowConfirmModal(false);
        setTimeout(() => setResetState('idle'), 300); // Wait for modal to close
      }, 2000);
    } catch (err) {
      setResetStatus('Error resetting data. Please try again.');
      setResetState('idle');
      setShowConfirmModal(false);
    }
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      className="p-6 lg:p-10 max-w-4xl mx-auto w-full flex-1"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item} className="mb-8 border-b border-outline-variant pb-6">
        <h2 className="text-3xl font-bold text-primary">Settings</h2>
        <p className="text-lg text-on-surface-variant mt-1">Manage your account and application preferences.</p>
      </motion.div>

      <div className="space-y-8">
        {/* Profile Section */}
        <motion.section variants={item} className="bg-surface border border-outline-variant rounded-2xl p-6 shadow-sm">
          <h3 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined">person</span>
            Profile
          </h3>
          {user ? (
            <div className="flex items-center gap-4">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName} className="w-16 h-16 rounded-full shrink-0 object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center shrink-0 text-2xl">
                  <span className="material-symbols-outlined">person</span>
                </div>
              )}
              <div>
                <p className="text-lg font-bold text-on-surface">{user.displayName || 'User'}</p>
                <p className="text-on-surface-variant">{user.email}</p>
              </div>
            </div>
          ) : (
            <div className="text-on-surface-variant">
              You are currently using the app persistently on this device. Sign in to synchronize your data securely across sessions.
            </div>
          )}
        </motion.section>

        {/* Preferences Section */}
        <motion.section variants={item} className="bg-surface border border-outline-variant rounded-2xl p-6 shadow-sm">
          <h3 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined">palette</span>
            Appearance
          </h3>
          
          <div className="flex flex-col gap-2 max-w-sm">
            <label className="text-sm font-bold text-on-surface-variant uppercase tracking-wide">Theme</label>
            <div className="grid grid-cols-3 gap-2 bg-surface-container p-1 rounded-xl">
              {(['light', 'dark', 'system'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors capitalize ${theme === t ? 'bg-surface shadow text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Data Management Section */}
        <motion.section variants={item} className="bg-error/5 border border-error/20 rounded-2xl p-6 shadow-sm">
          <h3 className="text-xl font-bold text-error mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined">warning</span>
            Data Management
          </h3>
          <p className="text-on-surface-variant text-sm mb-6 max-w-lg">
            Clearing all data will permanently remove all your assessments and scan results from both this device and the cloud. This action cannot be undone.
          </p>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowConfirmModal(true)}
              className="bg-error text-white px-6 py-2.5 rounded-xl font-bold hover:bg-error/90 transition-all shadow-lg shadow-error/10 active:scale-95 text-sm tracking-wide"
            >
              Factory Reset App
            </button>
            {resetStatus && (
              <span className={`text-sm font-medium ${resetStatus.includes('Error') ? 'text-error' : 'text-success'}`}>
                {resetStatus}
              </span>
            )}
          </div>
        </motion.section>
      </div>

      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => resetState === 'idle' && setShowConfirmModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface relative z-10 w-full max-w-md rounded-3xl p-8 shadow-2xl border border-outline-variant text-center"
            >
              {resetState === 'success' ? (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="flex flex-col items-center py-6"
                >
                  <div className="w-20 h-20 bg-success/10 text-success rounded-full flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-5xl">check_circle</span>
                  </div>
                  <h3 className="text-2xl font-bold text-on-surface mb-2">All Data Cleared</h3>
                  <p className="text-on-surface-variant">Your app has been restored to factory settings.</p>
                </motion.div>
              ) : (
                <>
                  <div className="mx-auto w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-4xl">warning</span>
                  </div>
                  <h3 className="text-2xl font-bold text-on-surface mb-3">Delete All Data?</h3>
                  <p className="text-on-surface-variant mb-8 leading-relaxed">
                    This will permanently delete all your tests, answer keys, and scanned responses. This action <strong className="text-error">cannot be undone</strong>.
                  </p>
                  
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => setShowConfirmModal(false)}
                      disabled={resetState !== 'idle'}
                      className="flex-1 py-3 px-4 rounded-xl font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeFactoryReset}
                      disabled={resetState !== 'idle'}
                      className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-error hover:bg-error/90 transition-colors shadow-lg shadow-error/20 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {resetState === 'resetting' ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                          Resetting...
                        </>
                      ) : (
                        "Yes, Delete All"
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
