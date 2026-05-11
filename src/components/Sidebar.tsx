import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { signInWithGoogle, logOut } from '../lib/firebase';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const navItems = [
  { path: '/', icon: 'dashboard', label: 'Dashboard' },
  { path: '/builder', icon: 'edit_note', label: 'Sheet Builder' },
  { path: '/scan', icon: 'photo_camera', label: 'Scan Sheets' },
  { path: '/history', icon: 'history', label: 'Test History' },
  { path: '/analytics', icon: 'analytics', label: 'Score Analytics' },
  { path: '/settings', icon: 'settings', label: 'Settings' },
];

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const location = useLocation();
  const user = useStore(state => state.user);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 z-20 md:hidden transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <motion.nav 
        initial={false}
        animate={{ width: isCollapsed ? 80 : 256 }}
        className={`bg-surface border-r border-outline-variant flex flex-col h-screen shrink-0 fixed left-0 top-0 z-30 transition-transform md:transition-none duration-300 ease-in-out md:translate-x-0 md:relative ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'} md:w-auto`}
      >
        <div className={`mb-6 mt-4 flex flex-col pt-2 ${isCollapsed ? 'px-2' : 'px-4'} overflow-hidden whitespace-nowrap relative`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center w-full' : ''}`}>
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm cursor-pointer hover:bg-primary/90 transition-colors" onClick={() => setIsCollapsed(!isCollapsed)} title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
                <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'wght' 300" }}>
                  stacked_inbox
                </span>
              </div>
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col"
                  >
                    <h1 className="text-2xl font-bold text-primary leading-tight">GradeStack</h1>
                    <p className="text-sm text-on-surface-variant leading-tight">Academic Portal</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {!isCollapsed && (
              <button 
                className="hidden md:flex text-on-surface-variant p-1.5 rounded-full hover:bg-surface-container-low shrink-0 transition-colors" 
                onClick={() => setIsCollapsed(!isCollapsed)}
                title="Collapse sidebar"
              >
                <span className="material-symbols-outlined text-[20px]">
                  keyboard_double_arrow_left
                </span>
              </button>
            )}
            
            <button className={`md:hidden text-on-surface-variant p-sm rounded-full hover:bg-surface-variant shrink-0 ${isCollapsed ? 'hidden' : ''}`} onClick={onClose}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className={isCollapsed ? 'px-2' : 'px-4'}>
          <Link 
            to="/builder"
            onClick={onClose}
            className={`w-full bg-primary text-white py-2.5 rounded-lg mb-6 hover:bg-primary/90 hover:shadow-md transition-all shadow-sm flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-center gap-2 px-4'}`}
            title="New Assessment"
          >
            <span className="material-symbols-outlined shrink-0" style={{ fontSize: '20px' }}>add_circle</span>
            {!isCollapsed && <span className="whitespace-nowrap font-bold text-sm tracking-tight">NEW ASSESSMENT</span>}
          </Link>
        </div>

        <ul className={`flex-1 space-y-1 overflow-y-auto overflow-x-hidden ${isCollapsed ? 'px-2' : 'px-4'}`}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onClose}
                  title={isCollapsed ? item.label : undefined}
                  className={`flex items-center ${isCollapsed ? 'justify-center py-4' : 'gap-4 px-4 py-3'} rounded-xl transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-on-surface-variant/70 hover:bg-surface-container-low hover:text-primary'
                  }`}
                >
                  <span className={`material-symbols-outlined shrink-0 ${isActive ? 'filled' : ''}`} style={{ fontVariationSettings: isActive ? "'FILL' 1" : "" }}>
                    {item.icon}
                  </span>
                  {!isCollapsed && <span className="text-sm whitespace-nowrap">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>


        
        <div className={`border-t border-outline-variant py-4 ${isCollapsed ? 'px-2' : 'px-4'}`}>
          {user ? (
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-2'} w-full rounded hover:bg-surface-container-low cursor-pointer py-2`} onClick={logOut} title="Log out">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full shrink-0 object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">person</span>
                </div>
              )}
              {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate text-on-surface">{user.displayName || 'User'}</p>
                    <p className="text-on-surface-variant text-[10px] uppercase font-bold tracking-widest">Signed In</p>
                  </div>
              )}
            </div>
          ) : (
            <button onClick={signInWithGoogle} className={`flex items-center justify-center ${isCollapsed ? 'p-2' : 'gap-2 px-2 py-2'} w-full border border-outline-variant rounded hover:bg-surface-container-low transition-colors text-on-surface`} title="Log in">
              <span className="material-symbols-outlined text-[18px]">login</span>
              {!isCollapsed && <span className="text-sm whitespace-nowrap">Log in</span>}
            </button>
          )}
        </div>
      </motion.nav>
    </>
  );
}
