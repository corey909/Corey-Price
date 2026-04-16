import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  collectionGroup,
  doc, 
  getDoc, 
  setDoc, 
  addDoc,
  onSnapshot, 
  query, 
  orderBy,
  where,
  updateDoc,
  deleteDoc,
  Timestamp 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Map as MapIcon, 
  Clock, 
  User as UserIcon, 
  Bell, 
  LogOut, 
  ChevronRight, 
  Search, 
  Filter,
  Info,
  Menu,
  X,
  CreditCard,
  GraduationCap,
  Users,
  Trash2,
  Edit2
} from 'lucide-react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Role = 'student' | 'parent' | 'admin';

interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  school?: string;
  graduationYear?: string;
  interests?: string[];
  createdAt: string;
}

interface ExpoEvent {
  id: string;
  name: string;
  city: string;
  date: string;
  time: string;
  location: string;
  description: string;
  mapUrl: string;
}

interface Seminar {
  id: string;
  eventId: string;
  title: string;
  speaker: string;
  time: string;
  room: string;
  category: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'alert' | 'update' | 'reminder';
  read: boolean;
  createdAt: string;
}

// --- Context ---
const UserContext = createContext<{
  user: AppUser | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  notifications: Notification[];
  markAsRead: (id: string) => Promise<void>;
}>({ user: null, loading: true, signIn: async () => {}, logout: async () => {}, notifications: [], markAsRead: async () => {} });

// --- Components ---

const EventDetails = ({ event, onBack }: { event: ExpoEvent, onBack: () => void }) => {
  const { user } = useContext(UserContext);
  const [seminars, setSeminars] = useState<Seminar[]>([]);
  const [timeFilter, setTimeFilter] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'events', event.id, 'seminars'), orderBy('time', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Seminar));
      setSeminars(fetched);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'seminars');
    });
    return () => unsubscribe();
  }, [event.id]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, `users/${user.uid}/registrations`, event.id), (doc) => {
      setIsRegistered(doc.exists());
    });
    return () => unsubscribe();
  }, [user, event.id]);

  const handleRegister = async () => {
    if (!user) return alert('Please sign in to register');
    setRegistering(true);
    try {
      await setDoc(doc(db, `users/${user.uid}/registrations`, event.id), {
        eventId: event.id,
        eventName: event.name,
        userName: user.displayName,
        userEmail: user.email,
        registeredAt: new Date().toISOString(),
        status: 'confirmed'
      });
      alert('Successfully registered for ' + event.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'registrations');
    } finally {
      setRegistering(false);
    }
  };

  const filteredSeminars = seminars.filter(s => 
    s.time.toLowerCase().includes(timeFilter.toLowerCase()) &&
    s.speaker.toLowerCase().includes(speakerFilter.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg border border-[#E4E6EB] shadow-sm overflow-hidden flex flex-col h-full"
    >
      {/* Header */}
      <div className="p-6 border-b border-[#E4E6EB] flex justify-between items-start">
        <div>
          <button 
            onClick={onBack}
            className="text-[11px] font-bold uppercase text-[#1976D2] mb-3 flex items-center gap-1 hover:underline"
          >
            ← Back to Dashboard
          </button>
          <h2 className="text-3xl font-extrabold text-[#1C1E21] tracking-tight">{event.name}</h2>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1 text-[13px] text-[#606770]">
              <MapIcon className="w-4 h-4 text-[#D32F2F]" />
              {event.location}, {event.city}
            </div>
            <div className="flex items-center gap-1 text-[13px] text-[#606770]">
              <Calendar className="w-4 h-4 text-[#D32F2F]" />
              {format(new Date(event.date), 'PPPP')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isRegistered ? (
            <div className="bg-[#E8F5E9] px-4 py-2 rounded-lg text-center border border-[#4CAF50]/20">
              <span className="block text-[10px] font-bold text-[#2E7D32] uppercase italic">Ticket Reserved</span>
              <span className="text-[#1B5E20] font-bold text-lg flex items-center gap-1 justify-center">
                Confirmed
              </span>
            </div>
          ) : (
            <button 
              onClick={handleRegister}
              disabled={registering}
              className="px-6 py-2.5 bg-[#D32F2F] text-white font-bold rounded-lg hover:bg-black transition-all shadow-sm disabled:opacity-50"
            >
              {registering ? 'Registering...' : 'Register for Expo'}
            </button>
          )}
          <div className="bg-[#F0F2F5] px-4 py-2 rounded-lg text-center border border-[#E4E6EB]">
            <span className="block text-[10px] font-bold text-[#606770] uppercase">Tickets</span>
            <span className="text-[#1C1E21] font-bold text-lg">Active</span>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <h3 className="text-[11px] font-bold uppercase text-[#606770] mb-3 border-b border-[#F0F2F5] pb-2">About the Event</h3>
            <p className="text-[14px] leading-relaxed text-[#1C1E21]">{event.description}</p>
          </section>

          <section>
            <div className="flex justify-between items-end mb-4 border-b border-[#F0F2F5] pb-2">
              <h3 className="text-[11px] font-bold uppercase text-[#606770]">Seminars & Workshops</h3>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#606770]" />
                  <input 
                    type="text"
                    placeholder="Filter speaker..."
                    value={speakerFilter}
                    onChange={(e) => setSpeakerFilter(e.target.value)}
                    className="pl-8 pr-3 py-1 bg-[#F0F2F5] rounded text-[11px] border border-transparent focus:border-[#1976D2] outline-none w-32 md:w-40"
                  />
                </div>
                <div className="relative">
                  <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#606770]" />
                  <input 
                    type="text"
                    placeholder="Filter time..."
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value)}
                    className="pl-8 pr-3 py-1 bg-[#F0F2F5] rounded text-[11px] border border-transparent focus:border-[#1976D2] outline-none w-28 md:w-32"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {filteredSeminars.length > 0 ? (
                filteredSeminars.map((s) => (
                  <div key={s.id} className="flex gap-4 items-start p-3 hover:bg-[#F8F9FA] rounded-lg transition-colors group">
                    <div className="font-mono text-[11px] text-[#D32F2F] font-bold w-20 pt-1">{s.time}</div>
                    <div className="flex-grow">
                      <div className="text-[14px] font-bold text-[#1C1E21] group-hover:text-[#1976D2] transition-colors">{s.title}</div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1 text-[11px] text-[#606770]">
                          <UserIcon className="w-3 h-3" />
                          <span className="font-semibold">{s.speaker}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-[#606770]">
                          <MapIcon className="w-3 h-3" />
                          {s.room}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-[#606770] text-[13px] italic bg-[#F8F9FA] rounded-xl">
                  {seminars.length === 0 ? "No seminars scheduled yet for this event." : "No seminars match your filters."}
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase text-[#606770] mb-3 border-b border-[#F0F2F5] pb-2">Schedule Overview</h3>
            <div className="space-y-4">
              {[
                { time: '09:00 AM', label: 'Doors Open & Registration' },
                { time: '10:00 AM', label: 'Opening Ceremony' },
                { time: '11:00 AM', label: 'Seminar Session 1' },
                { time: '01:00 PM', label: 'Main Floor Interaction' },
                { time: '04:00 PM', label: 'Closing Remarks' },
              ].map((item, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <div className="font-mono text-[11px] text-[#D32F2F] font-bold w-16">{item.time}</div>
                  <div className="text-[13px] font-semibold text-[#1C1E21]">{item.label}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <div className="bg-[#F8F9FA] border border-[#E4E6EB] rounded-lg p-5">
            <h3 className="text-[11px] font-bold uppercase text-[#606770] mb-4">Venue Details</h3>
            <div className="aspect-square bg-white border border-[#E4E6EB] rounded flex items-center justify-center mb-4 text-[#606770] text-[12px] text-center p-4">
              {/* This would be an interactive map or floorplan image */}
              <div className="flex flex-col items-center">
                <MapIcon className="w-8 h-8 mb-2 opacity-20" />
                Floor plan placeholder for {event.city}
              </div>
            </div>
            <button className="w-full py-2.5 bg-[#1976D2] text-white text-[12px] font-bold rounded hover:bg-[#1565C0] transition-colors">
              Download Hall Map (PDF)
            </button>
          </div>

          <div className="bg-[#FFF5F5] border border-[#D32F2F]/20 rounded-lg p-5">
            <h3 className="text-[11px] font-bold uppercase text-[#D32F2F] mb-2">Important Notice</h3>
            <p className="text-[12px] text-[#606770]">Please bring at least 10 copies of your transcripts if you are seeking on-the-spot admissions.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const ProfileSettings = ({ user, onUpdate }: { user: AppUser, onUpdate: (data: Partial<AppUser>) => Promise<void> }) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [school, setSchool] = useState(user.school || '');
  const [interestInput, setInterestInput] = useState('');
  const [interests, setInterests] = useState<string[]>(user.interests || []);
  const [saving, setSaving] = useState(false);

  const handleAddInterest = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && interestInput.trim()) {
      e.preventDefault();
      if (!interests.includes(interestInput.trim())) {
        setInterests([...interests, interestInput.trim()]);
      }
      setInterestInput('');
    }
  };

  const removeInterest = (tag: string) => {
    setInterests(interests.filter(i => i !== tag));
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({ displayName, school, interests });
    setSaving(false);
    alert('Profile updated successfully!');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto w-full space-y-6"
    >
      <div className="bg-white rounded-lg border border-[#E4E6EB] shadow-sm p-6">
        <h2 className="text-2xl font-bold text-[#1C1E21] mb-6 tracking-tight">Profile Settings</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Display Name</label>
            <input 
              type="text" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">{user.role === 'student' ? 'Current School' : 'Affiliation'}</label>
            <input 
              type="text" 
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
              placeholder={user.role === 'student' ? "High School or College Name" : "Organization Name"}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Areas of Interest</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {interests.map(tag => (
                <span key={tag} className="bg-[#E3F2FD] text-[#1976D2] text-[12px] font-bold px-2.5 py-1 rounded flex items-center gap-1.5">
                  {tag}
                  <button onClick={() => removeInterest(tag)} className="hover:text-[#D32F2F]">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input 
              type="text" 
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              onKeyDown={handleAddInterest}
              className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
              placeholder="Technology, Arts, Nursing... (Press Enter to add)"
            />
          </div>

          <div className="pt-4 border-t border-[#F0F2F5]">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-[#D32F2F] text-white font-bold rounded hover:bg-black transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#F8F9FA] rounded-lg border border-[#E4E6EB] p-5">
        <h3 className="text-[11px] font-bold uppercase text-[#606770] mb-2">Account Type</h3>
        <p className="text-[13px] font-bold text-[#1C1E21] capitalize">{user.role} Portal Access</p>
        <p className="text-[11px] text-[#606770] mt-1">Role-based permissions are fixed. Please contact support if you need to change your primary account role.</p>
      </div>
    </motion.div>
  );
};

const AdminEventManager = ({ events }: { events: ExpoEvent[] }) => {
  const { user } = useContext(UserContext);
  // Event Form State
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [city, setCity] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
  // Seminar Form State
  const [selectedEventId, setSelectedEventId] = useState('');
  const [sTitle, setSTitle] = useState('');
  const [sSpeaker, setSSpeaker] = useState('');
  const [sTime, setSTime] = useState('');
  const [sRoom, setSRoom] = useState('');
  
  // Registration List State
  const [targetEventForReport, setTargetEventForReport] = useState('');
  const [registrants, setRegistrants] = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!targetEventForReport) {
      setRegistrants([]);
      return;
    }

    setLoadingReport(true);
    // Use collectionGroup to find all registrations for this event across all users
    const q = query(
      collectionGroup(db, 'registrations'), 
      where('eventId', '==', targetEventForReport),
      orderBy('registeredAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRegistrants(fetched);
      setLoadingReport(false);
    }, (err) => {
      console.error(err);
      setLoadingReport(false);
    });

    return () => unsubscribe();
  }, [targetEventForReport]);

  if (user?.role !== 'admin') return null;

  const handleEditInit = (event: ExpoEvent) => {
    setEditingEventId(event.id);
    setName(event.name);
    setDate(event.date);
    setCity(event.city);
    setLocation(event.location);
    setDescription(event.description);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingEventId(null);
    setName(''); setDate(''); setCity(''); setLocation(''); setDescription('');
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'events', id));
      setDeletingEventId(null);
      alert('Event deleted successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'events');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !date || !city || !location || !description) return alert('Please fill all fields');
    
    setSaving(true);
    try {
      const eventData = {
        name,
        date,
        city,
        location,
        description,
        time: '9am - 4pm', // Default
        mapUrl: '',
        createdAt: new Date().toISOString()
      };

      if (editingEventId) {
        await updateDoc(doc(db, 'events', editingEventId), eventData);
        alert('Event updated successfully!');
        setEditingEventId(null);
      } else {
        await addDoc(collection(db, 'events'), eventData);
        alert('Event created successfully!');
      }

      setName(''); setDate(''); setCity(''); setLocation(''); setDescription('');
    } catch (error) {
      handleFirestoreError(error, editingEventId ? OperationType.UPDATE : OperationType.CREATE, 'events');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSeminar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !sTitle || !sSpeaker || !sTime || !sRoom) return alert('Please fill all seminar fields');

    setSaving(true);
    try {
      const seminarData = {
        title: sTitle,
        speaker: sSpeaker,
        time: sTime,
        room: sRoom,
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'events', selectedEventId, 'seminars'), seminarData);
      alert('Seminar added successfully!');
      setSTitle(''); setSSpeaker(''); setSTime(''); setSRoom('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'seminars');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto w-full space-y-8 pb-12"
    >
      {/* Event Creator */}
      <div className="bg-white rounded-lg border border-[#E4E6EB] shadow-sm p-8">
        <h2 className="text-2xl font-bold text-[#1C1E21] mb-6 tracking-tight">Create New Expo Event</h2>
        <form onSubmit={handleCreateEvent} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Event Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
                placeholder="e.g. California Black College Expo"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Date</label>
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">City</label>
              <input 
                type="text" 
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
                placeholder="e.g. Los Angeles"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Venue Location</label>
              <input 
                type="text" 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
                placeholder="e.g. LA Convention Center"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Event Description</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2] resize-none"
              placeholder="Tell attendees what to expect..."
            />
          </div>
          <div className="pt-4 flex gap-3">
            <button 
              type="submit"
              disabled={saving}
              className="flex-grow md:flex-none px-8 py-3 bg-[#D32F2F] text-white font-bold rounded hover:bg-black transition-colors disabled:opacity-50"
            >
              {saving ? 'Processing...' : editingEventId ? 'Update Expo Event' : 'Launch Expo Event'}
            </button>
            {editingEventId && (
              <button 
                type="button"
                onClick={handleCancelEdit}
                className="px-6 py-3 bg-[#F0F2F5] text-[#606770] font-bold rounded hover:bg-[#E4E6EB]"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Existing Events List */}
      <div className="bg-white rounded-lg border border-[#E4E6EB] shadow-sm p-8">
        <h2 className="text-xl font-bold text-[#1C1E21] mb-6 tracking-tight">Manage Existing Events</h2>
        <div className="space-y-3">
          {events.length === 0 ? (
            <div className="text-center py-6 text-[#606770] italic text-[13px]">No events found to manage.</div>
          ) : (
            events.map(event => (
              <div key={event.id} className="flex items-center justify-between p-4 border border-[#F0F2F5] rounded-xl hover:bg-[#F8F9FA] transition-colors">
                <div className="flex-grow">
                  <div className="font-bold text-[#1C1E21] text-[15px]">{event.name}</div>
                  <div className="text-[12px] text-[#606770]">{event.city} • {format(new Date(event.date), 'MMM dd, yyyy')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleEditInit(event)}
                    className="p-2 text-[#606770] hover:text-[#1976D2] transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setDeletingEventId(event.id)}
                    className="p-2 text-[#606770] hover:text-[#D32F2F] transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingEventId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-[#FFF5F5] text-[#D32F2F] rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-[#1C1E21] mb-2">Delete Event?</h3>
              <p className="text-[14px] text-[#606770] mb-8">
                Are you sure you want to delete <span className="font-bold text-[#1C1E21]">"{events.find(e => e.id === deletingEventId)?.name}"</span>? 
                This action cannot be undone and will also delete all associated seminars.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingEventId(null)}
                  className="flex-grow py-3 bg-[#F0F2F5] text-[#1C1E21] font-bold rounded-xl hover:bg-[#E4E6EB]"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeleteEvent(deletingEventId)}
                  className="flex-grow py-3 bg-[#D32F2F] text-white font-bold rounded-xl hover:bg-black"
                >
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Registrant List */}
      <div className="bg-white rounded-lg border border-[#E4E6EB] shadow-sm p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-[#1C1E21] tracking-tight">Event Registrants</h2>
          <select 
            value={targetEventForReport}
            onChange={(e) => setTargetEventForReport(e.target.value)}
            className="bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[13px] outline-none focus:border-[#1976D2] min-w-[200px]"
          >
            <option value="">Select event to view list...</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name} ({ev.city})</option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden border border-[#F0F2F5] rounded-xl">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#F8F9FA] text-[#606770] font-bold uppercase text-[10px] border-b border-[#F0F2F5]">
              <tr>
                <th className="px-4 py-3">Registrant Name</th>
                <th className="px-4 py-3">Registration Date</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2F5]">
              {loadingReport ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-[#606770]">Loading registrants...</td>
                </tr>
              ) : registrants.length > 0 ? (
                registrants.map((reg, idx) => (
                  <tr key={idx} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#1C1E21]">{reg.userName || 'Anonymous User'}</div>
                      <div className="text-[11px] text-[#606770]">{reg.userEmail || 'No email provided'}</div>
                    </td>
                    <td className="px-4 py-3 text-[#606770]">
                      {reg.registeredAt ? format(new Date(reg.registeredAt), 'MMM dd, yyyy p') : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-block px-2 py-0.5 rounded bg-[#E8F5E9] text-[#2E7D32] font-bold text-[10px] uppercase">
                        {reg.status || 'confirmed'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-[#606770] italic">
                    {targetEventForReport ? "No users have registered for this event yet." : "Please select an event to view the registration list."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seminar Creator */}
      <div className="bg-white rounded-lg border border-[#E4E6EB] shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <Clock className="w-5 h-5 text-[#1976D2]" />
          <h2 className="text-2xl font-bold text-[#1C1E21] tracking-tight">Add Seminar / Workshop</h2>
        </div>
        
        <form onSubmit={handleCreateSeminar} className="space-y-5">
          <div>
            <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Select Event</label>
            <select 
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
            >
              <option value="">Choose an existing event...</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name} ({ev.city})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Seminar Title</label>
              <input 
                type="text" 
                value={sTitle}
                onChange={(e) => setSTitle(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
                placeholder="e.g. Scholarships 101"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Speaker / Panelists</label>
              <input 
                type="text" 
                value={sSpeaker}
                onChange={(e) => setSSpeaker(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
                placeholder="e.g. Dr. Theresa Price"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Start Time</label>
              <input 
                type="text" 
                value={sTime}
                onChange={(e) => setSTime(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
                placeholder="e.g. 10:30 AM"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Room / Location</label>
              <input 
                type="text" 
                value={sRoom}
                onChange={(e) => setSRoom(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
                placeholder="e.g. Main Hall Stage"
              />
            </div>
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              disabled={saving}
              className="w-full md:w-auto px-8 py-3 bg-[#1976D2] text-white font-bold rounded hover:bg-black transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding Seminar...' : 'Publish Seminar'}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      setHasError(true);
      setErrorMsg(e.message);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-xl border border-red-100">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Info className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-6">We encountered an unexpected error. This might be related to your Firebase configuration or network.</p>
          <div className="bg-red-50 p-4 rounded-lg text-left mb-6 overflow-auto max-h-40">
            <code className="text-xs text-red-800">{errorMsg}</code>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center"
    >
      <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4" />
      <p className="text-gray-500 font-medium font-sans">Preparing Expo Experience...</p>
    </motion.div>
  </div>
);

const UserRoleSelector = ({ onSelect }: { onSelect: (role: Role) => void }) => {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to NCRF College Expo</h2>
        <p className="text-gray-600">Please select your role to customize your experience.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: GraduationCap, role: 'student', title: 'Student', desc: 'Find colleges, scholarships, and resources for your future.' },
          { icon: Users, role: 'parent', title: 'Parent', desc: 'Support your child’s educational journey with expert advice.' },
          { icon: CreditCard, role: 'admin', title: 'Administrator', desc: 'Manage events, vendors, and attendee data.' }
        ].map((item) => (
          <motion.button
            key={item.role}
            whileHover={{ y: -5 }}
            onClick={() => onSelect(item.role as Role)}
            className="flex flex-col items-center p-8 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-center"
          >
            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl mb-6">
              <item.icon className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.desc}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

const NotificationCenter = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const { notifications, markAsRead } = useContext(UserContext);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 z-[60]"
          />
          <motion.div 
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed right-0 top-0 h-full w-[350px] bg-white shadow-2xl z-[70] border-l border-[#E4E6EB] flex flex-col"
          >
            <div className="p-5 border-b border-[#E4E6EB] flex items-center justify-between bg-[#F8F9FA]">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#D32F2F]" />
                <h3 className="font-bold text-[#1C1E21]">Notifications</h3>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-[#E4E6EB] rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto no-scrollbar p-0">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-10 text-center opacity-40 h-full">
                  <Bell className="w-10 h-10 mb-2" />
                  <p className="text-[13px] font-medium">No new notifications</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div 
                    key={notif.id} 
                    className={cn(
                      "p-5 border-b border-[#F0F2F5] transition-colors relative",
                      !notif.read ? "bg-[#FFF5F5] border-l-4 border-l-[#D32F2F]" : "bg-white"
                    )}
                  >
                    {!notif.read && (
                      <button 
                        onClick={() => markAsRead(notif.id)}
                        className="absolute top-2 right-2 text-[10px] uppercase font-bold text-[#1976D2] hover:underline"
                      >
                        Mark as read
                      </button>
                    )}
                    <div className="text-[10px] font-bold uppercase text-[#606770] mb-1">
                      {notif.type} • {format(new Date(notif.createdAt), 'MMM dd, p')}
                    </div>
                    <div className="text-[14px] font-bold text-[#1C1E21] mb-1">{notif.title}</div>
                    <div className="text-[12px] text-[#606770] leading-snug">{notif.message}</div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const AdminNotificationPortal = () => {
  const { user } = useContext(UserContext);
  const [targetId, setTargetId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'alert' | 'update' | 'reminder'>('update');
  const [sending, setSending] = useState(false);

  if (user?.role !== 'admin') return null;

  const sendNotification = async () => {
    if (!targetId || !title || !message) return alert('Please fill all fields');
    setSending(true);
    try {
      const notifData = {
        userId: targetId,
        title,
        message,
        type,
        read: false,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(collection(db, `users/${targetId}/notifications`)), notifData);
      alert('Notification sent!');
      setTitle('');
      setMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${targetId}/notifications`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-[#E4E6EB] p-5 shadow-sm mt-4">
      <h3 className="text-[11px] font-bold uppercase text-[#606770] mb-4">Send System Notification</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-[#606770] mb-1">Target User UID</label>
          <input 
            type="text" 
            value={targetId} 
            onChange={(e) => setTargetId(e.target.value)}
            placeholder="User UID"
            className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-3 py-2 text-[13px] outline-none focus:border-[#1976D2]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-[#606770] mb-1">Title</label>
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Urgent Update"
            className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-3 py-2 text-[13px] outline-none focus:border-[#1976D2]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-[#606770] mb-1">Message</label>
          <textarea 
            value={message} 
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Description of the update..."
            rows={3}
            className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-3 py-2 text-[13px] outline-none focus:border-[#1976D2] resize-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-[#606770] mb-1">Type</label>
          <select 
            value={type} 
            onChange={(e) => setType(e.target.value as any)}
            className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-3 py-2 text-[13px] outline-none focus:border-[#1976D2]"
          >
            <option value="update">Update</option>
            <option value="alert">Alert</option>
            <option value="reminder">Reminder</option>
          </select>
        </div>
        <button 
          onClick={sendNotification}
          disabled={sending}
          className="w-full py-2 bg-[#D32F2F] text-white font-bold rounded text-[12px] uppercase tracking-wide hover:bg-black transition-colors disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Broadcast Notification'}
        </button>
      </div>
    </div>
  );
};

const Navbar = ({ onOpenNotifications }: { onOpenNotifications: () => void }) => {
  const { user, logout, notifications } = useContext(UserContext);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="h-[60px] bg-white border border-[#E4E6EB] rounded-lg flex items-center justify-between px-5 mb-4 shadow-sm">
      <div className="font-bold text-lg text-[#D32F2F] tracking-tight">
        National College Resources Foundation: LA Expo 2026
      </div>

      {user && (
        <div className="flex items-center gap-5">
          <div className="text-[12px] text-[#606770] hidden sm:block">
            Status: <span className="font-bold text-[#1C1E21]">Check-in Open</span>
          </div>
          <button 
            onClick={onOpenNotifications}
            className="relative p-2 bg-[#F0F2F5] rounded-full hover:bg-[#E4E6EB] transition-colors"
          >
            <Bell className="w-4 h-4 text-[#1C1E21]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#D32F2F] text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                {unreadCount}
              </span>
            )}
          </button>
          <button 
            onClick={logout}
            className="p-2 text-[#606770] hover:text-[#D32F2F] transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  );
};

const BoothMap = () => {
  const [selectedBooth, setSelectedBooth] = useState<{ name: string, premium: boolean, description?: string, representative?: string } | null>(null);

  const booths = [
    { name: 'UCLA', premium: true, description: 'University of California, Los Angeles. Top-tier research university.', representative: 'Sarah Johnson' },
    { name: 'Morehouse', premium: false, description: 'Historically Black men’s liberal arts college in Atlanta.', representative: 'Marcus Brown' },
    { name: 'NASA', premium: false, description: 'National Aeronautics and Space Administration. Inspiring the next generation.', representative: 'Dr. Ellen Ochoa' },
    { name: 'Spelman', premium: false, description: 'Historically Black women’s liberal arts college in Atlanta.', representative: 'Aaliyah Smith' },
    { name: 'US Navy', premium: false, description: 'Career opportunities and scholarships through military service.', representative: 'Cmdr. James Wilson' },
    { name: 'USC', premium: false, description: 'University of Southern California. Private research university in LA.', representative: 'Michael Chen' },
    { name: 'Wells Fargo', premium: false, description: 'Financial literacy and student banking resources.', representative: 'David Rodriguez' },
    { name: 'HBCU Hub', premium: true, description: 'One-stop shop for all your HBCU questions and resources.', representative: 'Keisha Taylor' },
    { name: 'Howard', premium: false, description: 'Howard University. Historically Black research university in DC.', representative: 'Dr. Wayne Frederick' },
    { name: 'Cal Poly', premium: false, description: 'California Polytechnic State University. Learn by doing.', representative: 'Jennifer Lopez' },
    { name: 'Google', premium: false, description: 'Tech careers and internships for students.', representative: 'Sundar Pichai' },
    { name: 'FAMU', premium: false, description: 'Florida A&M University. Public HBCU in Tallahassee.', representative: 'Larry Robinson' },
    { name: 'CSU LA', premium: false, description: 'California State University, Los Angeles.', representative: 'William Covino' },
    { name: 'Nike', premium: false, description: 'Sports management and design career pathways.', representative: 'John Donahoe' },
    { name: 'Tuskegee', premium: false, description: 'Tuskegee University. Private HBCU in Alabama.', representative: 'Charlotte Morris' },
    { name: 'NCRF Admin', premium: true, description: 'National College Resources Foundation headquarters.', representative: 'Theresa Price' },
    { name: 'Microsoft', premium: false, description: 'Software engineering and cloud computing workshops.', representative: 'Satya Nadella' },
    { name: 'Morgan St', premium: false, description: 'Morgan State University. Maryland’s Preeminent Public Urban Research University.', representative: 'David Wilson' },
    { name: 'Amazon', premium: false, description: 'AWS Educate and career opportunities.', representative: 'Andy Jassy' },
    { name: 'Clark Atl', premium: false, description: 'Clark Atlanta University. Private HBCU in Atlanta.', representative: 'George French Jr.' },
    { name: 'UC Berk', premium: false, description: 'University of California, Berkeley.', representative: 'Carol Christ' },
    { name: 'Delta', premium: false, description: 'Aviation and aerospace scholarships.', representative: 'Ed Bastian' },
    { name: 'A&T State', premium: false, description: 'North Carolina A&T State University.', representative: 'Harold Martin Sr.' },
    { name: 'Chevron', premium: false, description: 'STEM careers and energy sector resources.', representative: 'Mike Wirth' },
    { name: 'Grambling', premium: false, description: 'Grambling State University. HBCU in Louisiana.', representative: 'Rick Gallot' },
    { name: 'Yale', premium: false, description: 'Yale University undergraduate admissions.', representative: 'Peter Salovey' },
    { name: 'Xavier', premium: false, description: 'Xavier University of Louisiana. Historically Black Catholic university.', representative: 'Reynold Verret' },
    { name: 'Disney', premium: false, description: 'Disney on the Yard and creative career pathways.', representative: 'Bob Iger' },
    { name: 'Hampton', premium: false, description: 'Hampton University. Private HBCU in Virginia.', representative: 'William Harvey' },
    { name: 'Stanford', premium: false, description: 'Stanford University. Leading research university.', representative: 'Marc Tessier-Lavigne' }
  ];

  return (
    <div className="bg-white rounded-lg border border-[#E4E6EB] p-5 flex flex-col h-full shadow-sm relative">
      <div className="text-[11px] font-bold uppercase text-[#606770] mb-4 flex justify-between items-center">
        <span>Main Floor Layout (Hall B)</span>
        <span className="text-[#1976D2] cursor-pointer hover:underline text-[10px]">Click sections for info</span>
      </div>
      
      <div className="flex-grow grid grid-cols-6 gap-2 bg-[#F8F9FA] p-3 border border-dashed border-[#CCC] rounded relative">
        {booths.map((booth, i) => (
          <motion.div 
            key={i} 
            whileHover={{ scale: 1.05, zIndex: 10 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedBooth(booth)}
            className={cn(
              "flex items-center justify-center text-[10px] text-center p-1.5 font-medium border border-[#E4E6EB] transition-all cursor-pointer shadow-sm",
              booth.premium ? "bg-[#E3F2FD] border-[#1976D2] text-[#1976D2] font-bold" : "bg-white text-[#606770] hover:border-[#1976D2]"
            )}
          >
            {booth.name}
          </motion.div>
        ))}

        {/* Booth Detail Overlay */}
        <AnimatePresence>
          {selectedBooth && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-x-3 bottom-3 bg-white border border-[#1976D2] shadow-xl rounded-lg p-4 z-20 flex flex-col"
            >
              <button 
                onClick={() => setSelectedBooth(null)}
                className="absolute top-2 right-2 p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4 text-[#606770]" />
              </button>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-bold text-[#1C1E21]">{selectedBooth.name}</h4>
                {selectedBooth.premium && (
                  <span className="text-[9px] bg-[#D32F2F] text-white px-1.5 py-0.5 rounded font-black uppercase">Premium</span>
                )}
              </div>
              <p className="text-[11px] text-[#606770] mb-3 leading-relaxed">{selectedBooth.description}</p>
              <div className="mt-auto flex items-center justify-between border-t border-[#F0F2F5] pt-3">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase font-bold text-[#D32F2F]">Representative</span>
                  <span className="text-[12px] font-semibold text-[#1C1E21]">{selectedBooth.representative}</span>
                </div>
                <button className="px-3 py-1.5 bg-[#1976D2] text-white text-[10px] font-bold rounded hover:bg-[#1565C0]">
                  Get Virtual Brochure
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center gap-4 text-[10px] text-[#606770] font-medium">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-[#E3F2FD] border border-[#1976D2]" />
          <span>Premium Partner</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-white border border-[#E4E6EB]" />
          <span>General Vendor</span>
        </div>
      </div>
    </div>
  );
};

const DateCard: React.FC<{ month: string, day: string, city: string, active?: boolean, onClick?: () => void }> = ({ month, day, city, active, onClick }) => (
  <div 
    onClick={onClick}
    className={cn(
      "min-w-[140px] border border-[#E4E6EB] rounded-lg p-3 flex flex-col items-center transition-all cursor-pointer hover:shadow-md",
      active ? "border-[#D32F2F] bg-[#FFF5F5]" : "bg-white"
    )}
  >
    <span className="text-[10px] uppercase font-bold text-[#606770]">{month}</span>
    <span className="text-2xl font-extrabold my-1">{day}</span>
    <span className="text-[12px] font-semibold">{city}</span>
  </div>
);

const Dashboard = ({ events, onSelectEvent }: { events: ExpoEvent[], onSelectEvent: (event: ExpoEvent) => void }) => {
  const { user } = useContext(UserContext);

  if (!user) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* Booth Map Area */}
      <div className="lg:h-[450px]">
        <BoothMap />
      </div>

      {/* Workshop/Seminar Area */}
      <div className="bg-white rounded-lg border border-[#E4E6EB] p-4 shadow-sm h-full overflow-hidden flex flex-col">
        <div className="text-[11px] font-bold uppercase text-[#606770] mb-4">Today's Workshops</div>
        <div className="space-y-4 overflow-y-auto flex-grow custom-scrollbar pr-2">
          {[
            { time: '09:30 AM', title: 'Scholarships 101', room: 'Room 302', speaker: 'Dr. Price' },
            { time: '11:15 AM', title: 'The HBCU Experience', room: 'Main Stage', speaker: 'Panel' },
            { time: '01:00 PM', title: 'Student Athlete Seminar', room: 'Room 305', speaker: 'Coach Bell' },
            { time: '02:30 PM', title: 'Financial Aid Basics', room: 'Room 302', speaker: 'FAFSA Team' },
          ].map((w, i) => (
            <div key={i} className="pb-3 border-bottom border-[#E4E6EB] last:border-0 group">
              <div className="font-mono text-[11px] text-[#D32F2F] font-bold">{w.time}</div>
              <div className="text-[13px] font-bold text-[#1C1E21] group-hover:text-[#1976D2] transition-colors">{w.title}</div>
              <div className="text-[11px] text-[#606770]">{w.room} • {w.speaker}</div>
            </div>
          ))}
        </div>
        
        {/* Quick Stats Integration */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-[#E4E6EB]">
          <div className="bg-[#F0F2F5] p-2 rounded-lg text-center">
            <span className="block text-lg font-bold">240</span>
            <span className="text-[9px] text-[#606770] uppercase font-bold">Colleges</span>
          </div>
          <div className="bg-[#F0F2F5] p-2 rounded-lg text-center">
            <span className="block text-lg font-bold">$10M+</span>
            <span className="text-[9px] text-[#606770] uppercase font-bold">Money</span>
          </div>
          <div className="bg-[#F0F2F5] p-2 rounded-lg text-center">
            <span className="block text-lg font-bold">12</span>
            <span className="text-[9px] text-[#606770] uppercase font-bold">Workshops</span>
          </div>
        </div>
      </div>

      {/* Timeline/Events Area */}
      <div className="lg:col-span-2 bg-white rounded-lg border border-[#E4E6EB] p-4 flex gap-4 overflow-x-auto shadow-sm no-scrollbar">
        {events.length === 0 ? (
          <div className="py-8 px-4 text-center w-full opacity-40 italic text-[13px]">No upcoming events scheduled.</div>
        ) : (
          events.map((event) => {
            const dateObj = new Date(event.date);
            // Handling timezone drift for simple YYYY-MM-DD strings
            const userDate = new Date(dateObj.getTime() + dateObj.getTimezoneOffset() * 60000);
            const monthShort = format(userDate, 'MMM');
            const dayNum = format(userDate, 'dd');

            return (
              <DateCard 
                key={event.id}
                month={monthShort} 
                day={dayNum} 
                city={event.city} 
                onClick={() => onSelectEvent(event)}
              />
            );
          })
        )}
        <div className="min-w-[140px] border border-dashed border-[#E4E6EB] rounded-lg p-3 flex flex-col items-center justify-center opacity-40">
           <span className="text-[10px] uppercase font-bold text-[#606770]">Coming Soon</span>
           <span className="text-[12px] font-semibold">More Dates</span>
        </div>
      </div>
    </div>
  );
};

// --- App Root ---

export default function App() {
  const [fUser, setFUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsRole, setNeedsRole] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ExpoEvent | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'settings' | 'management'>('dashboard');
  const [events, setEvents] = useState<ExpoEvent[]>([]);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    let unsubscribeNotifs: (() => void) | null = null;
    let unsubscribeEvents: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setFUser(firebaseUser);
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUser(userDoc.data() as AppUser);
          setNeedsRole(false);

          // Notifications listener
          const qNotif = query(
            collection(db, `users/${firebaseUser.uid}/notifications`),
            orderBy('createdAt', 'desc')
          );
          unsubscribeNotifs = onSnapshot(qNotif, (snapshot) => {
            const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
            setNotifications(notifs);
          }, (err) => {
            handleFirestoreError(err, OperationType.LIST, 'notifications');
          });

        } else {
          setNeedsRole(true);
        }

        // Events listener (Global)
        const qEvents = query(collection(db, 'events'), orderBy('date', 'asc'));
        unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
          const fetchedEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpoEvent));
          setEvents(fetchedEvents);
        });

      } else {
        setUser(null);
        setNeedsRole(false);
        setNotifications([]);
        setEvents([]);
        if (unsubscribeNotifs) unsubscribeNotifs();
        if (unsubscribeEvents) unsubscribeEvents();
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeNotifs) unsubscribeNotifs();
      if (unsubscribeEvents) unsubscribeEvents();
    };
  }, []);

  const markAsRead = async (notifId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/notifications`, notifId), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'notifications');
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        alert('The sign-in popup was closed before completing. Please try again and keep the window open until finished.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore, another popup was opened
      } else if (error.code === 'auth/popup-blocked') {
        alert('The sign-in popup was blocked by your browser. Please allow popups for this site to sign in.');
      } else {
        console.error('Sign in failed', error);
        alert('Sign in failed. This might be due to iframe restrictions. Try opening the app in a new tab if this persists.');
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsLogoutConfirmOpen(false);
  };

  const handleUpdateProfile = async (updates: Partial<AppUser>) => {
    if (!user) return;
    try {
      const updatedUser = { ...user, ...updates };
      await updateDoc(doc(db, 'users', user.uid), updates);
      setUser(updatedUser);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const handleRoleSelection = async (role: Role) => {
    if (!fUser) return;
    const userData: AppUser = {
      uid: fUser.uid,
      email: fUser.email!,
      displayName: fUser.displayName || 'User',
      role: role,
      createdAt: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, 'users', fUser.uid), userData);
      setUser(userData);
      setNeedsRole(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <UserContext.Provider value={{ user, loading, signIn: handleSignIn, logout: () => setIsLogoutConfirmOpen(true), notifications, markAsRead }}>
      <ErrorBoundary>
        <NotificationCenter isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
        
        {/* Logout Confirmation Modal */}
        <AnimatePresence>
          {isLogoutConfirmOpen && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4 text-center">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full"
              >
                <div className="w-16 h-16 bg-[#F0F2F5] text-[#D32F2F] rounded-full flex items-center justify-center mx-auto mb-6">
                  <LogOut className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-[#1C1E21] mb-2">Sign Out?</h3>
                <p className="text-[14px] text-[#606770] mb-8">
                  Are you sure you want to log out of the NCRF Foundation Portal?
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsLogoutConfirmOpen(false)}
                    className="flex-grow py-3 bg-[#F0F2F5] text-[#1C1E21] font-bold rounded-xl hover:bg-[#E4E6EB]"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="flex-grow py-3 bg-[#D32F2F] text-white font-bold rounded-xl hover:bg-black"
                  >
                    Log Out
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="min-h-screen bg-[#F0F2F5] font-sans flex text-[#1C1E21] selection:bg-[#E3F2FD] selection:text-[#1976D2]">
          
          {/* Theme Sidebar */}
          {user && (
            <aside className="w-[240px] bg-[#1A2233] text-white flex-shrink-0 flex flex-col p-5 h-screen sticky top-0">
              <div className="pb-5 border-b border-white/10 mb-5">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#1976D2] mb-1">
                  {user.role} Portal
                </div>
                <div className="text-base font-semibold truncate">{user.displayName}</div>
                <div className="text-[11px] opacity-60 mt-1">NCRF Foundation</div>
              </div>
              <nav className="flex-grow">
                <ul className="space-y-1">
                  {[
                    { label: 'Event Dashboard', active: activeView === 'dashboard' && !selectedEvent, onClick: () => { setSelectedEvent(null); setActiveView('dashboard'); }, roles: ['student', 'parent', 'admin'] },
                    { label: 'My Scholarship Path', roles: ['student'] },
                    { label: 'Guidance Resources', roles: ['parent'] },
                    { label: 'Event Management', active: activeView === 'management', onClick: () => setActiveView('management'), roles: ['admin'] },
                    { label: 'Workshop Schedule', roles: ['student', 'parent', 'admin'] },
                    { label: 'Booth Floor Plan', roles: ['student', 'parent', 'admin'] },
                    { label: 'NCRF Resources', roles: ['student', 'parent', 'admin'] },
                    { label: 'Profile Settings', active: activeView === 'settings', onClick: () => setActiveView('settings'), roles: ['student', 'parent', 'admin'] }
                  ]
                  .filter(item => item.roles.includes(user.role))
                  .map((item, i) => (
                    <li 
                      key={i} 
                      onClick={item.onClick}
                      className={cn(
                        "py-2.5 text-[14px] cursor-pointer transition-colors hover:text-white",
                        item.active ? "text-white font-bold" : "text-white/70"
                      )}
                    >
                      {item.label}
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="mt-auto text-[11px] opacity-40">
                © 2026 NCRF College Expo
              </div>
            </aside>
          )}

          <div className="flex-grow flex flex-col min-h-screen">
            <main className="p-4 flex-grow flex flex-col max-w-[1200px] mx-auto w-full">
              {!user ? (
                needsRole ? (
                  <div className="mt-12"><UserRoleSelector onSelect={handleRoleSelection} /></div>
                ) : (
                  <section className="flex-grow flex flex-col items-center justify-center p-6 text-center">
                     <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E3F2FD] border border-[#1976D2]/20 mb-8"
                    >
                      <span className="w-1.5 h-1.5 bg-[#1976D2] rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold text-[#1976D2] uppercase tracking-widest">Empowering Students Nationwide</span>
                    </motion.div>
                    
                    <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-[#1C1E21] mb-6 leading-[0.9]">
                      National College Resources <br />
                      <span className="text-[#D32F2F]">Foundation Portal</span>
                    </h1>
                    
                    <p className="text-base text-[#606770] mb-8 font-medium max-w-lg mx-auto">
                      Access scholarship opportunities, college resources, and event maps. Start your educational journey today.
                    </p>
                    
                    <button 
                      onClick={handleSignIn}
                      className="px-8 py-3 bg-[#1A2233] text-white font-bold rounded-lg flex items-center justify-center gap-3 mx-auto hover:bg-black transition-all shadow-lg"
                    >
                      <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" referrerPolicy="no-referrer" />
                      Student/Parent Login
                    </button>

                    <p className="mt-6 text-[11px] text-[#606770] opacity-60">
                      Trouble signing in? Try allowing popups or opening the app in a new tab.
                    </p>
                  </section>
                )
              ) : (
                <>
                  <Navbar onOpenNotifications={() => setIsNotificationsOpen(true)} />
                  {activeView === 'settings' ? (
                    <ProfileSettings user={user} onUpdate={handleUpdateProfile} />
                  ) : activeView === 'management' ? (
                    <AdminEventManager events={events} />
                  ) : selectedEvent ? (
                    <EventDetails 
                      event={selectedEvent} 
                      onBack={() => setSelectedEvent(null)} 
                    />
                  ) : (
                    <>
                      <Dashboard events={events} onSelectEvent={(e) => setSelectedEvent(e)} />
                      <AdminNotificationPortal />
                    </>
                  )}
                </>
              )}
            </main>

            {/* Sub-footer for non-logged-in users */}
            {!user && (
              <footer className="py-8 bg-white border-t border-[#E4E6EB]">
                <div className="max-w-7xl mx-auto px-4 text-center">
                   <p className="text-[11px] text-[#606770] font-medium">© 2026 National College Resources Foundation. A 501(c)(3) Non-Profit.</p>
                </div>
              </footer>
            )}
          </div>
        </div>
      </ErrorBoundary>
    </UserContext.Provider>
  );
}
