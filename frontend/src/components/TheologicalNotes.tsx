'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as d3 from 'd3';
import { fetchSavedNote, saveVerseNote, fetchAuthMe, updateSavedNote, SavedNote, User } from '@/lib/api';

interface TheologicalNotesProps {
  verseId: number;
  verseOsisId: string;
  canvasHeight?: string;
}

// Client-side parser to extract exact Strong's numbers (e.g. H7225)
const extractStrongsNumbers = (text: string): string[] => {
  if (!text) return [];
  const matches = text.match(/[HG]\d+/gi) || [];
  const normalized = matches.map(s => {
    const match = s.match(/^([HG])0*(\d+)/i);
    return match ? `${match[1].toUpperCase()}${match[2]}` : s.toUpperCase();
  });
  return Array.from(new Set(normalized));
};

export default function TheologicalNotes({ verseId, verseOsisId, canvasHeight }: TheologicalNotesProps) {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [noteText, setNoteText] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'my-notes' | 'community' | 'mind-map'>('my-notes');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showToast, setShowToast] = useState(false);

  // Spatial states
  const [positions, setPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [dragTrigger, setDragTrigger] = useState(0);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Sync token from localStorage
  useEffect(() => {
    const handleAuth = () => {
      setToken(localStorage.getItem('token'));
    };
    handleAuth();
    window.addEventListener('auth-change', handleAuth);
    return () => window.removeEventListener('auth-change', handleAuth);
  }, []);

  // Fetch current user details if logged in
  useEffect(() => {
    if (token) {
      fetchAuthMe(token)
        .then(setCurrentUser)
        .catch((err) => {
          console.error('Failed to fetch user me:', err);
          setCurrentUser(null);
        });
    } else {
      setCurrentUser(null);
    }
  }, [token]);

  // Fetch saved notes for this verse
  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setStatusMessage(null);
      const fetchedNotes = await fetchSavedNote(verseId, token);
      setNotes(fetchedNotes);
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setLoading(false);
    }
  }, [verseId, token]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Listen for the custom 'note-saved' event
  useEffect(() => {
    const handleNoteSaved = () => {
      loadNotes();
    };
    window.addEventListener('note-saved', handleNoteSaved);
    return () => window.removeEventListener('note-saved', handleNoteSaved);
  }, [loadNotes]);

  // D3 Force Simulation Setup
  useEffect(() => {
    if (notes.length === 0) return;

    // Construct node coordinate values
    const simulationNodes = notes.map(n => ({
      id: n.id,
      x: n.x_position ?? (Math.random() * 200 + 50),
      y: n.y_position ?? (Math.random() * 200 + 50)
    }));

    // Build D3 Links
    const simulationLinks: { source: number; target: number }[] = [];
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const strongsA = extractStrongsNumbers(notes[i].note_text);
        const strongsB = extractStrongsNumbers(notes[j].note_text);
        const overlap = strongsA.some(s => strongsB.includes(s));
        if (overlap) {
          simulationLinks.push({ source: notes[i].id, target: notes[j].id });
        }
      }
    }

    const needsSimulation = notes.some(n => n.x_position === null || n.y_position === null);

    if (needsSimulation) {
      // Run force layout simulation to distribute new notes nicely
      const simulation = d3.forceSimulation(simulationNodes)
        .force("charge", d3.forceManyBody().strength(-120))
        .force("center", d3.forceCenter(180, 140))
        .force("link", d3.forceLink(simulationLinks).id((d: any) => d.id).distance(90))
        .force("collision", d3.forceCollide().radius(65))
        .stop();

      // Run synchronous ticks to let coordinates settle
      for (let i = 0; i < 60; i++) simulation.tick();

      const newPositions: Record<number, { x: number; y: number }> = {};
      simulationNodes.forEach(node => {
        // Clamp initial force layout offsets within bounds
        const clampedX = Math.max(15, Math.min(300, node.x));
        const clampedY = Math.max(15, Math.min(220, node.y));

        const original = notes.find(n => n.id === node.id);
        if (original) {
          newPositions[node.id] = {
            x: original.x_position ?? Math.round(clampedX),
            y: original.y_position ?? Math.round(clampedY)
          };
        }
      });
      setPositions(newPositions);
    } else {
      // Load exact coordinate properties from database
      const newPositions: Record<number, { x: number; y: number }> = {};
      notes.forEach(n => {
        newPositions[n.id] = {
          x: n.x_position ?? (Math.random() * 200 + 50),
          y: n.y_position ?? (Math.random() * 200 + 50)
        };
      });
      setPositions(newPositions);
    }
  }, [notes]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!noteText.trim()) return;

    try {
      setSaving(true);
      setStatusMessage(null);
      // Place newly saved notes without hardcoded coordinates to let them fan out
      await saveVerseNote(verseId, noteText, token, isPublic);
      setShowToast(true);
      setNoteText('');
      setIsPublic(false);
      loadNotes();
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to save note.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAuth = () => {
    window.dispatchEvent(new Event('open-auth-modal'));
  };

  const getAuthorLabel = (note: SavedNote) => {
    if (note.user?.email) {
      return note.user.email.split('@')[0];
    }
    return `User #${note.user_id}`;
  };

  const myNotes = notes.filter((n) => currentUser && n.user_id === currentUser.id);
  const communityNotes = notes.filter((n) => n.is_public);

  // Build semantic links list for current render block
  const links = (() => {
    const list: { source: number; target: number }[] = [];
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const strongsA = extractStrongsNumbers(notes[i].note_text);
        const strongsB = extractStrongsNumbers(notes[j].note_text);
        const overlap = strongsA.some(s => strongsB.includes(s));
        if (overlap) {
          list.push({ source: notes[i].id, target: notes[j].id });
        }
      }
    }
    return list;
  })();

  // Resolve note center coordinates for linking SVG lines
  const getCardCenter = (id: number) => {
    const el = document.getElementById(`note-card-${id}`);
    const canvas = canvasRef.current;
    if (el && canvas) {
      const rect = el.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        x: rect.left - canvasRect.left + el.offsetWidth / 2,
        y: rect.top - canvasRect.top + el.offsetHeight / 2
      };
    }
    // Fallback based on saved positions
    const initialPos = positions[id] || { x: 150, y: 150 };
    return { x: initialPos.x + 72, y: initialPos.y + 48 }; // Card center offsets for 144px width, 96px height
  };

  return (
    <div className="p-5 bg-neutral-900/40 border border-neutral-800 rounded-2xl backdrop-blur-md flex flex-col gap-4">
      {/* Header title */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <h3 className="text-xs font-bold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Study Notes ({verseOsisId})
        </h3>
        {loading && (
          <span className="w-3.5 h-3.5 border border-neutral-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-neutral-800 gap-2">
        <button
          onClick={() => setActiveTab('my-notes')}
          className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 text-center cursor-pointer ${
            activeTab === 'my-notes'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-350'
          }`}
        >
          My Notes
        </button>
        <button
          onClick={() => setActiveTab('community')}
          className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 text-center cursor-pointer ${
            activeTab === 'community'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-350'
          }`}
        >
          Community
        </button>
        <button
          onClick={() => setActiveTab('mind-map')}
          className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 text-center cursor-pointer ${
            activeTab === 'mind-map'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-350'
          }`}
        >
          Mind Map
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'my-notes' && (
        <div className="flex flex-col gap-4">
          {!token ? (
            <div className="py-6 flex flex-col items-center justify-center text-center gap-3">
              <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-neutral-400">Save Study Notes</h3>
                <p className="text-xs text-neutral-500 leading-relaxed max-w-[220px]">
                  Sign in to keep track of lexical definitions, cross-references, and translations.
                </p>
              </div>
              <button
                onClick={handleOpenAuth}
                className="mt-1 px-4 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Sign In to Note Take
              </button>
            </div>
          ) : (
            <>
              {/* Input Form */}
              <form onSubmit={handleSave} className="flex flex-col gap-3">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  disabled={loading || saving}
                  placeholder="Write your theological thoughts, notes or cross-references here..."
                  className="w-full h-24 bg-neutral-950 border border-neutral-850 focus:border-amber-500/80 rounded-xl p-3 text-neutral-200 text-sm placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-amber-500/80 transition-all resize-none"
                />

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      disabled={saving || loading}
                      className="w-4 h-4 accent-amber-500 rounded bg-neutral-950 border border-neutral-850 focus:ring-0 cursor-pointer disabled:opacity-50"
                    />
                    <span className="text-neutral-400 text-xs hover:text-neutral-350 transition-colors">
                      Make Public (Share with others)
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={saving || loading || !noteText.trim()}
                    className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-neutral-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <span className="w-3 h-3 border border-neutral-950 border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Note'
                    )}
                  </button>
                </div>
                
                {statusMessage && (
                  <div className="text-[11px] leading-snug">
                    <span className={statusMessage.type === 'success' ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                      {statusMessage.text}
                    </span>
                  </div>
                )}
              </form>

              {/* My Notes List */}
              <div className="border-t border-neutral-850 pt-3 mt-1 flex flex-col gap-2">
                <h4 className="text-xs font-bold text-neutral-400 mb-1">Your Saved Notes</h4>
                {myNotes.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">No notes saved for this verse yet. Write one above!</p>
                ) : (
                  <div className="flex flex-col gap-2.5 max-w-full max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {myNotes.map((note) => (
                      <div key={note.id} className="p-3 bg-neutral-950 border border-neutral-850 rounded-xl flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[10px] text-neutral-550">
                          <span>{new Date(note.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                          <span className={`px-1.5 py-0.5 rounded-full border text-[9px] font-semibold uppercase tracking-wider ${
                            note.is_public 
                              ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20' 
                              : 'bg-neutral-900 text-neutral-450 border-neutral-800'
                          }`}>
                            {note.is_public ? 'Public' : 'Private'}
                          </span>
                        </div>
                        <p className="text-neutral-255 text-xs whitespace-pre-wrap leading-relaxed">{note.note_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'community' && (
        /* Community Tab Contents */
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-bold text-neutral-400">Shared by the community</h4>
          {communityNotes.length === 0 ? (
            <p className="text-xs text-neutral-500 italic py-4 text-center">No community notes shared for this verse yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5 max-w-full max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
              {communityNotes.map((note) => (
                <div key={note.id} className="p-3.5 bg-neutral-950 border border-neutral-850 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] text-neutral-550 border-b border-neutral-900 pb-1.5">
                    <span className="font-mono text-amber-500/70">@{getAuthorLabel(note)}</span>
                    <span>{new Date(note.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                  </div>
                  <p className="text-neutral-255 text-xs whitespace-pre-wrap leading-relaxed">{note.note_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mind-map' && (
        /* Spatial Canvas Mind Map Tab Contents */
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>Drag cards to organize them visually. Subtle lines connect notes that share Strong's lexical roots.</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Mine</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500" /> Community</span>
            </div>
          </div>
          <div 
            id="mindmap-canvas" 
            ref={canvasRef}
            className={`relative w-full bg-neutral-950/60 border border-neutral-850 rounded-2xl overflow-hidden shadow-inner select-none ${canvasHeight || 'h-[360px]'}`}
            style={{
              backgroundImage: 'radial-gradient(rgba(245, 158, 11, 0.12) 1px, transparent 0)',
              backgroundSize: '20px 20px'
            }}
          >
            {/* SVG Link lines between note nodes */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              {links.map((link, idx) => {
                const start = getCardCenter(link.source);
                const end = getCardCenter(link.target);
                return (
                  <line
                    key={idx}
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    className="stroke-amber-500/15 stroke-[1.2px] pointer-events-none transition-all duration-75"
                  />
                );
              })}
            </svg>

            {/* Draggable and stationary note cards */}
            {notes.map((note) => {
              const isOwnNote = !!(currentUser && note.user_id === currentUser.id);
              const initialPos = positions[note.id] || { x: 150, y: 150 };

              return (
                <motion.div
                  key={note.id}
                  id={`note-card-${note.id}`}
                  drag={isOwnNote}
                  dragMomentum={false}
                  dragElastic={0}
                  dragConstraints={canvasRef}
                  style={{
                    position: 'absolute',
                    left: initialPos.x,
                    top: initialPos.y,
                    x: 0,
                    y: 0,
                    zIndex: 10
                  }}
                  onDrag={() => setDragTrigger(prev => prev + 1)}
                  onDragEnd={async () => {
                    const cardElement = document.getElementById(`note-card-${note.id}`);
                    const canvasElement = canvasRef.current;
                    if (cardElement && canvasElement) {
                      const cardRect = cardElement.getBoundingClientRect();
                      const canvasRect = canvasElement.getBoundingClientRect();
                      
                      // Clamp relative offsets to canvas bounds
                      const relativeX = Math.max(10, Math.min(canvasRect.width - 150, cardRect.left - canvasRect.left));
                      const relativeY = Math.max(10, Math.min(canvasRect.height - 110, cardRect.top - canvasRect.top));
                      
                      const newX = Math.round(relativeX);
                      const newY = Math.round(relativeY);

                      setPositions(prev => ({
                        ...prev,
                        [note.id]: { x: newX, y: newY }
                      }));

                      if (isOwnNote && token) {
                        try {
                          await updateSavedNote(note.id, token, {
                            x_position: newX,
                            y_position: newY
                          });
                        } catch (err) {
                          console.error('Failed to update saved coordinate position:', err);
                        }
                      }
                    }
                  }}
                  className={`w-36 h-24 p-2 rounded-xl border text-left flex flex-col justify-between shadow-lg transition-all ${
                    isOwnNote
                      ? 'bg-neutral-900/95 border-amber-500/40 hover:border-amber-500 cursor-grab active:cursor-grabbing shadow-amber-500/5'
                      : 'bg-neutral-900/90 border-teal-500/30 hover:border-teal-500/60 cursor-default shadow-teal-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-[8px] text-neutral-500 border-b border-neutral-850 pb-0.5 mb-1">
                    <span className="font-mono truncate max-w-[55px]">
                      {isOwnNote ? 'me' : `@${getAuthorLabel(note)}`}
                    </span>
                    <span className="shrink-0">
                      {new Date(note.created_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar text-[9.5px] leading-normal text-neutral-300 pr-0.5 select-text">
                    {note.note_text}
                  </div>
                  {isOwnNote && (
                    <div className="flex justify-end pt-1">
                      <span className={`text-[7px] font-semibold uppercase px-1 rounded-sm border ${
                        note.is_public 
                          ? 'text-emerald-400 bg-emerald-950/10 border-emerald-500/20' 
                          : 'text-neutral-450 bg-neutral-950 border-neutral-800'
                      }`}>
                        {note.is_public ? 'Public' : 'Private'}
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}

            {notes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-center p-6 text-neutral-550 text-xs italic">
                No notes saved for this verse yet. Add one in "My Notes" to see the mind map layout!
              </div>
            )}
          </div>
        </div>
      )}
      
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-neutral-900/95 border border-amber-500/40 rounded-xl px-4 py-3 shadow-[0_10px_30px_rgba(245,158,11,0.2)] text-xs font-bold text-amber-300 backdrop-blur-md"
          >
            <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            Note Saved!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
