import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  facebookProvider,
  appleProvider,
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  collectionGroup,
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  addDoc,
  onSnapshot, 
  query, 
  orderBy,
  where,
  updateDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
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
  ChevronLeft,
  Search, 
  Filter,
  Info,
  Menu,
  X,
  CreditCard,
  GraduationCap,
  Users,
  Trash2,
  Edit2,
  Share2,
  Star,
  ZoomIn,
  ZoomOut,
  Download,
  RefreshCcw,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Loader2,
  Plus,
  Mail,
  Lock,
  Bookmark,
  Briefcase,
  ExternalLink,
  Facebook,
  Linkedin,
  Twitter,
  Apple
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  parseISO
} from 'date-fns';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
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
  savedEvents?: string[];
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
  description?: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'alert' | 'update' | 'reminder';
  read: boolean;
  createdAt: string;
}

interface Feedback {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface ScholarshipApplication {
  id: string;
  name: string;
  provider: string;
  amount: number;
  deadline: string;
  status: 'pending' | 'awarded' | 'rejected' | 'draft';
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

// --- Helper for Calendar Links ---
const getCalendarLinks = (event: ExpoEvent) => {
  try {
    const eventDate = new Date(event.date);
    const start = new Date(eventDate);
    start.setHours(9, 0, 0);
    const end = new Date(eventDate);
    end.setHours(16, 0, 0);

    const formatG = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
    
    const title = encodeURIComponent(event.name);
    const details = encodeURIComponent(event.description);
    const location = encodeURIComponent(`${event.location}, ${event.city}`);
    
    return {
      google: `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${formatG(start)}/${formatG(end)}&details=${details}&location=${location}`,
      outlook: `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${title}&startdt=${start.toISOString()}&enddt=${end.toISOString()}&body=${details}&location=${location}`
    };
  } catch (e) {
    return { google: '#', outlook: '#' };
  }
};

const getSeminarCalendarLinks = (event: ExpoEvent, seminar: Seminar) => {
  try {
    const eventDate = new Date(event.date);
    const start = new Date(eventDate);
    
    // Parse s.time like "10:30 AM" or "1:00 PM"
    const timeRe = /(\d+):(\d+)\s*(AM|PM)/i;
    const match = seminar.time.match(timeRe);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const ampm = match[3].toUpperCase();
      
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      
      start.setHours(hours, minutes, 0);
    } else {
      // Fallback
      start.setHours(10, 0, 0);
    }
    
    const end = new Date(start.getTime() + 45 * 60000); // 45 min duration

    const formatG = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
    
    const title = encodeURIComponent(`${seminar.title} - ${event.name}`);
    const details = encodeURIComponent(`${seminar.description || ''}\nSpeaker: ${seminar.speaker}\nRoom: ${seminar.room}`);
    const location = encodeURIComponent(`${seminar.room}, ${event.location}, ${event.city}`);
    
    return {
      google: `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${formatG(start)}/${formatG(end)}&details=${details}&location=${location}`,
      outlook: `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${title}&startdt=${start.toISOString()}&enddt=${end.toISOString()}&body=${details}&location=${location}`
    };
  } catch (e) {
    return { google: '#', outlook: '#' };
  }
};

const getShareLinks = (event: ExpoEvent) => {
  const url = encodeURIComponent(window.location.href);
  const text = encodeURIComponent(`Check out the ${event.name} in ${event.city}!`);
  const subject = encodeURIComponent(`NCRF Event: ${event.name}`);
  const body = encodeURIComponent(`Check out this event: ${event.name}\n\nLocation: ${event.location}, ${event.city}\nDate: ${format(new Date(event.date), 'PPPP')}\n\n${event.description}`);

  return {
    twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    email: `mailto:?subject=${subject}&body=${body}`
  };
};

// --- Components ---

const EventDetails = ({ event, onBack, onEdit }: { event: ExpoEvent, onBack: () => void, onEdit?: (event: ExpoEvent) => void }) => {
  const { user } = useContext(UserContext);
  const [seminars, setSeminars] = useState<Seminar[]>([]);
  const [timeFilter, setTimeFilter] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  
  // Feedback State
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
  const [showCalendarMenu, setShowCalendarMenu] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [expandedSeminarId, setExpandedSeminarId] = useState<string | null>(null);
  const [activeSeminarCalendarId, setActiveSeminarCalendarId] = useState<string | null>(null);
  const [selectedSeminarForModal, setSelectedSeminarForModal] = useState<Seminar | null>(null);
  const [loadingSeminars, setLoadingSeminars] = useState(true);
  const [loadingFeedback, setLoadingFeedback] = useState(true);
  const [loadingRegistration, setLoadingRegistration] = useState(true);
  const [eventRegistrants, setEventRegistrants] = useState<any[]>([]);
  const [loadingEventRegistrants, setLoadingEventRegistrants] = useState(false);
  const [updatingRegStatus, setUpdatingRegStatus] = useState(false);
  const [togglingSave, setTogglingSave] = useState(false);

  const isSaved = user?.savedEvents?.includes(event.id) || false;

  useEffect(() => {
    if (user?.role !== 'admin') return;
    
    setLoadingEventRegistrants(true);
    const q = query(
      collectionGroup(db, 'registrations'),
      where('eventId', '==', event.id),
      orderBy('registeredAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        path: doc.ref.path,
        ...doc.data() 
      }));
      setEventRegistrants(fetched);
      setLoadingEventRegistrants(false);
    }, (err) => {
      console.error(err);
      setLoadingEventRegistrants(false);
    });
    
    return () => unsubscribe();
  }, [event.id, user?.role]);

  useEffect(() => {
    setLoadingFeedback(true);
    const q = query(collection(db, 'events', event.id, 'feedback'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Feedback));
      setFeedbacks(fetched);
      setLoadingFeedback(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'feedback');
      setLoadingFeedback(false);
    });
    return () => unsubscribe();
  }, [event.id]);

  useEffect(() => {
    setLoadingSeminars(true);
    const q = query(collection(db, 'events', event.id, 'seminars'), orderBy('time', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Seminar));
      setSeminars(fetched);
      setLoadingSeminars(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'seminars');
      setLoadingSeminars(false);
    });
    return () => unsubscribe();
  }, [event.id]);

  useEffect(() => {
    if (!user) {
      setLoadingRegistration(false);
      return;
    }
    setLoadingRegistration(true);
    const unsubscribe = onSnapshot(doc(db, `users/${user.uid}/registrations`, event.id), (doc) => {
      setIsRegistered(doc.exists());
      setLoadingRegistration(false);
    }, (err) => {
      console.error(err);
      setLoadingRegistration(false);
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
      setShowRegisterConfirm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'registrations');
    } finally {
      setRegistering(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!user) return alert('Please sign in to leave feedback');
    if (!rating) return alert('Please select a rating');
    
    setSubmittingFeedback(true);
    try {
      await addDoc(collection(db, 'events', event.id, 'feedback'), {
        userId: user.uid,
        userName: user.displayName,
        rating,
        comment,
        createdAt: new Date().toISOString()
      });
      setComment('');
      setRating(5);
      alert('Thank you for your feedback!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'feedback');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleUpdateRegStatus = async (path: string, newStatus: string) => {
    setUpdatingRegStatus(true);
    try {
      await updateDoc(doc(db, path), { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setUpdatingRegStatus(false);
    }
  };

  const handleToggleSave = async () => {
    if (!user) return alert('Please sign in to save events');
    setTogglingSave(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      if (isSaved) {
        await updateDoc(userRef, {
          savedEvents: arrayRemove(event.id)
        });
      } else {
        await updateDoc(userRef, {
          savedEvents: arrayUnion(event.id)
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'user profile');
    } finally {
      setTogglingSave(false);
    }
  };

  const filteredSeminars = seminars.filter(s => 
    s.time.toLowerCase().includes(timeFilter.toLowerCase()) &&
    s.speaker.toLowerCase().includes(speakerFilter.toLowerCase())
  );

  const calendarLinks = getCalendarLinks(event);
  const shareLinks = getShareLinks(event);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg border border-[#E4E6EB] shadow-sm overflow-hidden flex flex-col h-full"
    >
      {/* Seminar Detail Modal */}
      <AnimatePresence>
        {selectedSeminarForModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-xl w-full"
            >
              <div className="relative h-32 bg-gradient-to-br from-[#1976D2] to-[#D32F2F] p-8">
                <button 
                  onClick={() => setSelectedSeminarForModal(null)}
                  className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="mt-4 inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-[10px] font-bold text-white uppercase tracking-widest border border-white/20">
                  {selectedSeminarForModal.category || 'Workshop'}
                </div>
              </div>

              <div className="p-8 -mt-8 bg-white rounded-t-3xl relative">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-[#1C1E21] tracking-tight leading-tight mb-2">
                      {selectedSeminarForModal.title}
                    </h3>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center gap-2 text-[13px] text-[#606770]">
                        <div className="w-8 h-8 rounded-full bg-[#F0F2F5] flex items-center justify-center font-bold text-[#1976D2]">
                          {selectedSeminarForModal.speaker.charAt(0)}
                        </div>
                        <span className="font-bold">{selectedSeminarForModal.speaker}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[13px] text-[#606770]">
                        <Clock className="w-4 h-4 text-[#D32F2F]" />
                        <span className="font-bold">{selectedSeminarForModal.time}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <section>
                    <h4 className="text-[11px] font-bold uppercase text-[#606770] mb-3 flex items-center gap-2">
                      <Info className="w-3 h-3" />
                      About this Session
                    </h4>
                    <div className="text-[15px] text-[#4B4F56] leading-relaxed bg-[#F8F9FA] p-5 rounded-2xl border border-[#F0F2F5]">
                      {selectedSeminarForModal.description ? (
                        selectedSeminarForModal.description
                      ) : (
                        <span className="italic opacity-60">Join us for a deep dive into {selectedSeminarForModal.title}. Details will be shared during the presentation.</span>
                      )}
                    </div>
                  </section>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-[#F0F2F5] rounded-xl border border-[#E4E6EB]">
                      <span className="block text-[10px] font-bold uppercase text-[#606770] mb-1">Room / Location</span>
                      <div className="flex items-center gap-2 text-[14px] font-black text-[#1C1E21]">
                        <MapIcon className="w-4 h-4 text-[#1976D2]" />
                        {selectedSeminarForModal.room}
                      </div>
                    </div>
                    <div className="p-4 bg-[#F0F2F5] rounded-xl border border-[#E4E6EB]">
                      <span className="block text-[10px] font-bold uppercase text-[#606770] mb-1">Capacity</span>
                      <div className="flex items-center gap-2 text-[14px] font-black text-[#1C1E21]">
                        <Users className="w-4 h-4 text-[#1976D2]" />
                        Open Seating
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      onClick={() => {
                        const links = getSeminarCalendarLinks(event, selectedSeminarForModal);
                        window.open(links.google, '_blank');
                      }}
                      className="flex-grow py-4 bg-[#1976D2] text-white font-bold rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#1976D2]/20"
                    >
                      <Calendar className="w-5 h-5" />
                      Add to Google Calendar
                    </button>
                    <button 
                      onClick={() => setSelectedSeminarForModal(null)}
                      className="px-8 py-4 bg-[#F0F2F5] text-[#1C1E21] font-bold rounded-2xl hover:bg-[#E4E6EB] transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="p-6 border-b border-[#E4E6EB] flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <button 
              onClick={onBack}
              className="text-[11px] font-bold uppercase text-[#1976D2] flex items-center gap-1 hover:underline"
            >
              ← Back to Dashboard
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="text-[11px] font-bold uppercase text-[#606770] flex items-center gap-1 hover:text-[#1976D2] transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Event
              </button>
              
              <AnimatePresence>
                {showShareMenu && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute top-full left-0 mt-2 bg-white border border-[#E4E6EB] rounded-xl shadow-2xl z-20 overflow-hidden w-48"
                  >
                    <a 
                      href={shareLinks.twitter} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 text-[12px] text-[#1C1E21] hover:bg-[#F0F2F5] transition-colors"
                      onClick={() => setShowShareMenu(false)}
                    >
                      <Twitter className="w-4 h-4 text-[#1DA1F2]" />
                      <span>X (Twitter)</span>
                    </a>
                    <a 
                      href={shareLinks.facebook} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 text-[12px] text-[#1C1E21] hover:bg-[#F0F2F5] transition-colors border-t border-[#F0F2F5]"
                      onClick={() => setShowShareMenu(false)}
                    >
                      <Facebook className="w-4 h-4 text-[#1877F2]" />
                      <span>Facebook</span>
                    </a>
                    <a 
                      href={shareLinks.linkedin} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 text-[12px] text-[#1C1E21] hover:bg-[#F0F2F5] transition-colors border-t border-[#F0F2F5]"
                      onClick={() => setShowShareMenu(false)}
                    >
                      <Linkedin className="w-4 h-4 text-[#0A66C2]" />
                      <span>LinkedIn</span>
                    </a>
                    <a 
                      href={shareLinks.email} 
                      className="flex items-center gap-3 px-4 py-3 text-[12px] text-[#1C1E21] hover:bg-[#F0F2F5] transition-colors border-t border-[#F0F2F5]"
                      onClick={() => setShowShareMenu(false)}
                    >
                      <Mail className="w-4 h-4 text-[#606770]" />
                      <span>Email</span>
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {user?.role === 'admin' && onEdit && (
              <button 
                onClick={() => onEdit(event)}
                className="text-[11px] font-bold uppercase text-[#1976D2] flex items-center gap-1 hover:bg-[#E3F2FD] px-2 py-0.5 rounded transition-all"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit Event
              </button>
            )}
          </div>
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
          {loadingRegistration ? (
            <div className="px-6 py-2.5 bg-[#F0F2F5] rounded-lg flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-[#606770]" />
            </div>
          ) : isRegistered ? (
            <div className="bg-[#E8F5E9] px-4 py-2 rounded-lg text-center border border-[#4CAF50]/20">
              <span className="block text-[10px] font-bold text-[#2E7D32] uppercase italic">Ticket Reserved</span>
              <span className="text-[#1B5E20] font-bold text-lg flex items-center gap-1 justify-center">
                Confirmed
              </span>
            </div>
          ) : (
            <button 
              onClick={() => setShowRegisterConfirm(true)}
              disabled={registering}
              className="px-6 py-2.5 bg-[#D32F2F] text-white font-bold rounded-lg hover:bg-black transition-all shadow-sm disabled:opacity-50"
            >
              {registering ? 'Registering...' : 'Register for Expo'}
            </button>
          )}
          <button 
            onClick={handleToggleSave}
            disabled={togglingSave}
            className={cn(
              "p-2.5 rounded-lg border transition-all flex items-center gap-2",
              isSaved 
                ? "bg-[#E3F2FD] border-[#1976D2] text-[#1976D2]" 
                : "bg-white border-[#E4E6EB] text-[#606770] hover:border-[#1976D2] hover:text-[#1976D2]"
            )}
            title={isSaved ? "Remove from Saved" : "Save for Later"}
          >
            {togglingSave ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Bookmark className={cn("w-5 h-5", isSaved && "fill-current")} />
            )}
            <span className="text-[12px] font-bold uppercase tracking-tight hidden md:inline">
              {isSaved ? "Saved" : "Save"}
            </span>
          </button>
          <div className="bg-[#F0F2F5] px-4 py-2 rounded-lg text-center border border-[#E4E6EB]">
            <span className="block text-[10px] font-bold text-[#606770] uppercase">Tickets</span>
            <span className="text-[#1C1E21] font-bold text-lg">Active</span>
          </div>
        </div>
      </div>

      {/* Registration Confirmation Modal */}
      <AnimatePresence>
        {showRegisterConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-[#F0F2F5] text-[#1976D2] rounded-full flex items-center justify-center mx-auto mb-6">
                <Calendar className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-extrabold text-[#1C1E21] mb-2 tracking-tight">Confirm Registration?</h3>
              <p className="text-[14px] text-[#606770] mb-8 leading-relaxed">
                You are about to register for the <span className="font-bold text-[#1C1E21]">{event.name}</span> in {event.city}. We'll reserve your ticket for the event date.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowRegisterConfirm(false)}
                  className="flex-grow py-3 bg-[#F0F2F5] text-[#1C1E21] font-bold rounded-xl hover:bg-[#E4E6EB] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleRegister}
                  disabled={registering}
                  className="flex-grow py-3 bg-[#D32F2F] text-white font-bold rounded-xl hover:bg-black transition-all disabled:opacity-50"
                >
                  {registering ? 'Processing...' : 'Yes, Register'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
              {loadingSeminars ? (
                <div className="py-12 flex flex-col items-center justify-center text-[#606770] bg-[#F8F9FA] rounded-xl border border-dashed border-[#E4E6EB]">
                  <Loader2 className="w-8 h-8 animate-spin mb-2 opacity-20" />
                  <p className="text-[13px] font-medium">Loading session details...</p>
                </div>
              ) : filteredSeminars.length > 0 ? (
                filteredSeminars.map((s) => {
                  const CategoryIcon = s.category === 'Scholarships' ? GraduationCap : 
                                     s.category === 'Admissions' ? CheckCircle : 
                                     s.category === 'Career Advice' ? Briefcase : UserIcon;

                  return (
                    <div 
                      key={s.id} 
                      className="flex gap-4 items-start p-4 hover:bg-[#F8F9FA] rounded-xl transition-all group border border-transparent hover:border-[#E4E6EB] hover:shadow-sm"
                    >
                      <div className="font-mono text-[11px] text-[#D32F2F] font-bold w-20 pt-1 shrink-0">{s.time}</div>
                      <div className="flex-grow">
                        <button 
                          onClick={() => setSelectedSeminarForModal(s)}
                          className="text-left group/btn transition-all block w-full"
                        >
                          <div className="text-[14px] font-black tracking-tight text-[#1C1E21] group-hover:text-[#1976D2] transition-colors leading-tight flex items-center gap-2">
                            <CategoryIcon className="w-4 h-4 text-[#606770] group-hover/btn:text-[#1976D2] transition-colors" />
                            {s.title}
                          </div>
                          {s.description && (
                            <p className="text-[12px] text-[#606770] line-clamp-1 mt-1 font-medium group-hover/btn:text-[#1C1E21] transition-colors">
                              {s.description}
                            </p>
                          )}
                        </button>
                        
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1 text-[11px] text-[#606770]">
                            <UserIcon className="w-3.5 h-3.5 opacity-40 shrink-0" />
                            <span className="font-bold">{s.speaker}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-[#606770]">
                            <MapIcon className="w-3.5 h-3.5 opacity-40 shrink-0" />
                            <span className="font-bold">{s.room}</span>
                          </div>
                          <div className="ml-auto flex items-center gap-4">
                             <div className="relative">
                               <button 
                                 onClick={() => setActiveSeminarCalendarId(activeSeminarCalendarId === s.id ? null : s.id)}
                                 className="text-[10px] font-black uppercase tracking-widest text-[#606770] hover:text-[#D32F2F] transition-colors flex items-center gap-1.5"
                               >
                                 <Calendar className="w-3 h-3" />
                                 Calendar
                               </button>
                               
                               <AnimatePresence>
                                 {activeSeminarCalendarId === s.id && (
                                   <motion.div 
                                     initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                     animate={{ opacity: 1, scale: 1, y: 0 }}
                                     exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                     className="absolute bottom-full right-0 mb-2 bg-white border border-[#E4E6EB] rounded-lg shadow-xl z-30 min-w-[140px] overflow-hidden"
                                   >
                                     {(() => {
                                       const semLinks = getSeminarCalendarLinks(event, s);
                                       return (
                                         <>
                                           <a 
                                             href={semLinks.google} 
                                             target="_blank" 
                                             rel="noopener noreferrer"
                                             className="flex items-center justify-between px-3 py-2.5 text-[11px] font-bold text-[#1C1E21] hover:bg-[#F0F2F5] transition-colors"
                                             onClick={() => setActiveSeminarCalendarId(null)}
                                           >
                                             Google Calendar
                                           </a>
                                           <a 
                                             href={semLinks.outlook} 
                                             target="_blank" 
                                             rel="noopener noreferrer"
                                             className="flex items-center justify-between px-3 py-2.5 text-[11px] font-bold text-[#1C1E21] hover:bg-[#F0F2F5] transition-colors border-t border-[#F0F2F5]"
                                             onClick={() => setActiveSeminarCalendarId(null)}
                                           >
                                             Outlook
                                           </a>
                                         </>
                                       );
                                     })()}
                                   </motion.div>
                                 )}
                               </AnimatePresence>
                             </div>

                             <button 
                               onClick={() => setSelectedSeminarForModal(s)}
                               className="text-[10px] font-black uppercase tracking-widest text-[#1976D2] hover:text-black transition-colors flex items-center gap-1"
                             >
                               View Details
                               <ChevronRight className="w-3 h-3" />
                             </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
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

          {user?.role === 'admin' && (
            <section className="bg-white border border-[#E4E6EB] rounded-2xl overflow-hidden shadow-sm mt-8">
              <div className="p-5 border-b border-[#F0F2F5] flex justify-between items-center bg-[#F8F9FA]/50">
                <div>
                  <h3 className="text-[11px] font-bold uppercase text-[#1976D2] tracking-widest">Admin Controls</h3>
                  <h4 className="text-[15px] font-black text-[#1C1E21] mt-0.5">Event Registrants</h4>
                </div>
                <div className="px-3 py-1 bg-white border border-[#E4E6EB] rounded-full text-[10px] font-bold text-[#606770]">
                  {eventRegistrants.length} Total
                </div>
              </div>
              
              <div className="p-4">
                {loadingEventRegistrants ? (
                  <div className="py-12 flex flex-col items-center justify-center text-[#606770]">
                    <Loader2 className="w-6 h-6 animate-spin mb-2 opacity-20" />
                    <p className="text-[11px] font-bold uppercase tracking-widest">Fetching registrants...</p>
                  </div>
                ) : eventRegistrants.length === 0 ? (
                  <div className="py-12 text-center text-[13px] text-[#606770] italic">
                    No registrations recorded for this event yet.
                  </div>
                ) : (
                  <div className="overflow-hidden border border-[#F0F2F5] rounded-xl">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-[#F8F9FA] text-[#606770] font-bold uppercase text-[9px] border-b border-[#F0F2F5]">
                        <tr>
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F2F5]">
                        {eventRegistrants.map((reg, idx) => (
                          <tr key={idx} className="hover:bg-[#F8F9FA] transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-bold text-[#1C1E21]">{reg.userName || 'Anonymous'}</div>
                              <div className="text-[10px] text-[#606770] truncate max-w-[150px]">{reg.userEmail}</div>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={reg.status || 'confirmed'}
                                disabled={updatingRegStatus}
                                onChange={(e) => handleUpdateRegStatus(reg.path, e.target.value)}
                                className={cn(
                                  "px-1.5 py-0.5 rounded font-bold text-[9px] uppercase border-none outline-none cursor-pointer bg-transparent transition-all",
                                  reg.status === 'confirmed' ? "bg-[#E8F5E9] text-[#2E7D32]" : 
                                  reg.status === 'pending' ? "bg-[#FFF3E0] text-[#E65100]" :
                                  "bg-[#FFF5F5] text-[#D32F2F]"
                                )}
                              >
                                <option value="confirmed">Confirmed</option>
                                <option value="pending">Pending</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-[10px] text-[#606770] italic">Direct Edit</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-[#F8F9FA] border border-[#E4E6EB] rounded-lg p-5">
            <h3 className="text-[11px] font-bold uppercase text-[#606770] mb-4">Venue Details</h3>
            <div className="aspect-square bg-white border border-[#E4E6EB] rounded flex items-center justify-center mb-4 text-[#606770] text-[12px] text-center p-4">
              {event.mapUrl ? (
                <img src={event.mapUrl} alt="Hall Map" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex flex-col items-center">
                  <MapIcon className="w-8 h-8 mb-2 opacity-20" />
                  Floor plan placeholder for {event.city}
                </div>
              )}
            </div>
            {event.mapUrl ? (
              <a 
                href={event.mapUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                download={`HallMap_${event.city}.pdf`}
                className="w-full py-2.5 bg-[#1976D2] text-white text-[12px] font-bold rounded hover:bg-[#1565C0] transition-colors flex items-center justify-center gap-2"
              >
                Download Hall Map (PDF)
              </a>
            ) : (
              <button disabled className="w-full py-2.5 bg-[#E4E6EB] text-[#606770] text-[12px] font-bold rounded cursor-not-allowed">
                No Map Available
              </button>
            )}

            <div className="relative mt-2">
              <button 
                onClick={() => setShowCalendarMenu(!showCalendarMenu)}
                className="w-full py-2.5 bg-white border border-[#E4E6EB] text-[#1C1E21] text-[12px] font-bold rounded hover:bg-[#F0F2F5] transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <Calendar className="w-3.5 h-3.5 text-[#D32F2F]" />
                Add to Calendar
              </button>
              
              <AnimatePresence>
                {showCalendarMenu && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#E4E6EB] rounded-xl shadow-2xl z-20 overflow-hidden"
                  >
                    <a 
                      href={calendarLinks.google} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-4 py-3 text-[12px] text-[#1C1E21] hover:bg-[#F0F2F5] transition-colors"
                      onClick={() => setShowCalendarMenu(false)}
                    >
                      <span>Google Calendar</span>
                      <ExternalLink className="w-3 h-3 opacity-30" />
                    </a>
                    <a 
                      href={calendarLinks.outlook} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-4 py-3 text-[12px] text-[#1C1E21] hover:bg-[#F0F2F5] transition-colors border-t border-[#F0F2F5]"
                      onClick={() => setShowCalendarMenu(false)}
                    >
                      <span>Outlook / Office 365</span>
                      <ExternalLink className="w-3 h-3 opacity-30" />
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="bg-[#F8F9FA] border border-[#E4E6EB] rounded-lg p-5">
            <h3 className="text-[11px] font-bold uppercase text-[#606770] mb-4 border-b border-[#E4E6EB] pb-2">Feedback & Ratings</h3>
            <div className="space-y-4">
              {/* Star Rating Input */}
              <div className="bg-white p-4 rounded-lg border border-[#E4E6EB] shadow-sm">
                <label className="block text-[10px] font-bold uppercase text-[#606770] mb-2 text-center tracking-wider">Rate this Event</label>
                <div className="flex justify-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button 
                      key={star}
                      onClick={() => setRating(star)}
                      className="p-1 transition-transform active:scale-90"
                    >
                      <Star 
                        className={cn(
                          "w-5 h-5",
                          star <= rating ? "fill-[#FFB400] text-[#FFB400]" : "text-[#E4E6EB]"
                        )} 
                      />
                    </button>
                  ))}
                </div>
                <textarea 
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share your experience (optional)..."
                  className="w-full bg-[#F0F2F5] border border-transparent rounded-lg p-3 text-[12px] outline-none focus:border-[#1976D2] min-h-[60px] resize-none placeholder:text-[#606770]/50"
                />
                <button 
                  onClick={handleSubmitFeedback}
                  disabled={submittingFeedback}
                  className="w-full mt-3 py-2 bg-[#D32F2F] text-white font-bold rounded text-[11px] uppercase tracking-wide hover:bg-black transition-colors disabled:opacity-50"
                >
                  {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>

              {/* Feedback List */}
              <div className="pt-2">
                <h4 className="text-[10px] font-bold uppercase text-[#606770] mb-3">Community Opinions</h4>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {loadingFeedback ? (
                    <div className="py-12 flex flex-col items-center justify-center text-[#606770] bg-white border border-dashed border-[#E4E6EB] rounded-xl">
                      <Loader2 className="w-5 h-5 animate-spin mb-2 opacity-20" />
                      <p className="text-[10px] font-bold uppercase tracking-wider">Loading reviews...</p>
                    </div>
                  ) : feedbacks.length > 0 ? (
                    feedbacks.map((fb) => (
                      <div key={fb.id} className="bg-white p-3 rounded-lg border border-[#F0F2F5] shadow-sm hover:border-[#1976D2]/20 transition-colors">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-[11px] text-[#1C1E21]">{fb.userName}</span>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star key={s} className={cn("w-2 h-2", s <= fb.rating ? "fill-[#FFB400] text-[#FFB400]" : "text-[#E4E6EB]")} />
                            ))}
                          </div>
                        </div>
                        {fb.comment && <p className="text-[12px] text-[#606770] leading-tight font-medium italic">"{fb.comment}"</p>}
                        <span className="text-[9px] text-[#A0A0A0] mt-1.5 block font-bold">
                          {format(new Date(fb.createdAt), 'MMM dd, yyyy')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 bg-white border border-dashed border-[#E4E6EB] rounded-lg text-[#606770] text-[11px] italic">No reviews yet.</div>
                  )}
                </div>
              </div>
            </div>
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
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#F8F9FA] rounded-xl flex items-center justify-center p-1.5 border border-[#E4E6EB]">
            <img src={LOGO_URL} alt="NCRF" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <h2 className="text-2xl font-black text-[#1C1E21] tracking-tight uppercase">User Profile Settings</h2>
        </div>
        
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

// --- Constants ---
const LOGO_URL = "https://www.thecollegeexpo.org/wp-content/uploads/2022/10/NCRF-Logo.png";

const AdminEventManager = ({ events, initialEditEvent }: { events: ExpoEvent[], initialEditEvent?: ExpoEvent | null }) => {
  const { user } = useContext(UserContext);
  // Event Form State
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [city, setCity] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
  // Seminar Form State
  const [selectedEventId, setSelectedEventId] = useState('');
  const [sTitle, setSTitle] = useState('');
  const [sSpeaker, setSSpeaker] = useState('');
  const [sTime, setSTime] = useState('');
  const [sRoom, setSRoom] = useState('');
  const [sCategory, setSCategory] = useState('');
  const [sDescription, setSDescription] = useState('');
  const [editingSeminarId, setEditingSeminarId] = useState<string | null>(null);
  const [seminarsForSelectedEvent, setSeminarsForSelectedEvent] = useState<Seminar[]>([]);
  const [deletingSeminarId, setDeletingSeminarId] = useState<string | null>(null);
  const [loadingSeminars, setLoadingSeminars] = useState(false);
  
  // Registration List State
  const [targetEventForReport, setTargetEventForReport] = useState('');
  const [registrants, setRegistrants] = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [deletingReg, setDeletingReg] = useState<any | null>(null);

  useEffect(() => {
    if (initialEditEvent) {
      handleEditInit(initialEditEvent);
    }
  }, [initialEditEvent]);

  useEffect(() => {
    if (!targetEventForReport) {
      setRegistrants([]);
      return;
    }

    setLoadingReport(true);
    // Use collectionGroup to find all registrations for this event across all users
    let q;
    const constraints: any[] = [];
    
    if (targetEventForReport !== 'all') {
      constraints.push(where('eventId', '==', targetEventForReport));
    }
    
    if (statusFilter !== 'all') {
      constraints.push(where('status', '==', statusFilter));
    }

    q = query(
      collectionGroup(db, 'registrations'),
      ...constraints,
      orderBy('registeredAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        path: doc.ref.path,
        ...doc.data() 
      }));
      setRegistrants(fetched);
      setLoadingReport(false);
    }, (err) => {
      console.error(err);
      setLoadingReport(false);
    });

    return () => unsubscribe();
  }, [targetEventForReport, statusFilter]);

  useEffect(() => {
    if (!selectedEventId) {
      setSeminarsForSelectedEvent([]);
      return;
    }
    setLoadingSeminars(true);
    const q = query(collection(db, 'events', selectedEventId, 'seminars'), orderBy('time', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Seminar));
      setSeminarsForSelectedEvent(fetched);
      setLoadingSeminars(false);
    }, (err) => {
      console.error(err);
      setLoadingSeminars(false);
    });
    return () => unsubscribe();
  }, [selectedEventId]);

  const handleExportCSV = () => {
    if (registrants.length === 0) return alert('No data to export');

    const headers = ['Name', 'Email', 'Event', 'Registered At', 'Status'];
    const rows = registrants.map(reg => [
      `"${reg.userName || 'Anonymous'}"`,
      `"${reg.userEmail || 'N/A'}"`,
      `"${reg.eventName || 'N/A'}"`,
      `"${reg.registeredAt ? format(new Date(reg.registeredAt), 'yyyy-MM-dd HH:mm:ss') : 'N/A'}"`,
      `"${reg.status || 'confirmed'}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const fileName = `Registrants_${targetEventForReport === 'all' ? 'All_Events' : 'Event'}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (user?.role !== 'admin') return null;

  const handleEditInit = (event: ExpoEvent) => {
    setEditingEventId(event.id);
    setName(event.name);
    setDate(event.date);
    setCity(event.city);
    setLocation(event.location);
    setDescription(event.description);
    setMapUrl(event.mapUrl || '');
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingEventId(null);
    setName(''); setDate(''); setCity(''); setLocation(''); setDescription(''); setMapUrl('');
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
        mapUrl,
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

      setName(''); setDate(''); setCity(''); setLocation(''); setDescription(''); setMapUrl('');
    } catch (error) {
      handleFirestoreError(error, editingEventId ? OperationType.UPDATE : OperationType.CREATE, 'events');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSeminar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !sTitle || !sSpeaker || !sTime || !sRoom || !sCategory) return alert('Please fill all seminar fields');

    setSaving(true);
    try {
      const seminarData = {
        title: sTitle,
        speaker: sSpeaker,
        time: sTime,
        room: sRoom,
        category: sCategory,
        description: sDescription,
        createdAt: new Date().toISOString()
      };

      if (editingSeminarId) {
        await updateDoc(doc(db, 'events', selectedEventId, 'seminars', editingSeminarId), seminarData);
        alert('Seminar updated successfully!');
        setEditingSeminarId(null);
      } else {
        await addDoc(collection(db, 'events', selectedEventId, 'seminars'), seminarData);
        alert('Seminar added successfully!');
      }

      setSTitle(''); setSSpeaker(''); setSTime(''); setSRoom(''); setSCategory(''); setSDescription('');
    } catch (error) {
      handleFirestoreError(error, editingSeminarId ? OperationType.UPDATE : OperationType.CREATE, 'seminars');
    } finally {
      setSaving(false);
    }
  };

  const handleEditSeminarInit = (seminar: Seminar) => {
    setEditingSeminarId(seminar.id);
    setSTitle(seminar.title);
    setSSpeaker(seminar.speaker);
    setSTime(seminar.time);
    setSRoom(seminar.room);
    setSCategory(seminar.category || '');
    setSDescription(seminar.description || '');
    // Focus the form
    document.getElementById('seminar-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelSeminarEdit = () => {
    setEditingSeminarId(null);
    setSTitle(''); setSSpeaker(''); setSTime(''); setSRoom(''); setSCategory(''); setSDescription('');
  };

  const handleDeleteSeminar = async (seminarId: string) => {
    if (!selectedEventId) return;
    try {
      await deleteDoc(doc(db, 'events', selectedEventId, 'seminars', seminarId));
      setDeletingSeminarId(null);
      alert('Seminar deleted successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'seminars');
    }
  };

  const handleUpdateRegStatus = async (path: string, newStatus: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, path), { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReg = async (path: string) => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, path));
      setDeletingReg(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
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
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Map PDF URL</label>
              <input 
                type="text" 
                value={mapUrl}
                onChange={(e) => setMapUrl(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
                placeholder="https://..."
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
        <div className="space-y-4">
          {events.length === 0 ? (
            <div className="text-center py-6 text-[#606770] italic text-[13px]">No events found to manage.</div>
          ) : (
            events.map(event => (
              <div key={event.id} className="border border-[#F0F2F5] rounded-xl overflow-hidden bg-white hover:border-[#E4E6EB] transition-all">
                <div className={cn(
                  "flex items-center justify-between p-4 transition-colors",
                  selectedEventId === event.id ? "bg-[#F8F9FA]" : "hover:bg-[#F8F9FA]"
                )}>
                  <div className="flex-grow cursor-pointer" onClick={() => setSelectedEventId(selectedEventId === event.id ? '' : event.id)}>
                    <div className="font-bold text-[#1C1E21] text-[15px] flex items-center gap-2">
                      {event.name}
                      {selectedEventId === event.id ? <ChevronRight className="w-3 h-3 rotate-90 transition-transform" /> : <ChevronRight className="w-3 h-3 transition-transform" />}
                    </div>
                    <div className="text-[12px] text-[#606770]">{event.city} • {format(new Date(event.date), 'MMM dd, yyyy')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setSelectedEventId(selectedEventId === event.id ? '' : event.id)}
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        selectedEventId === event.id ? "text-[#1976D2] bg-[#E3F2FD]" : "text-[#606770] hover:bg-[#F0F2F5]"
                      )}
                      title="Manage Seminars"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleEditInit(event)}
                      className="p-2 text-[#606770] hover:text-[#1976D2] transition-colors"
                      title="Edit Event"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setDeletingEventId(event.id)}
                      className="p-2 text-[#606770] hover:text-[#D32F2F] transition-colors"
                      title="Delete Event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Inline Seminar Management */}
                <AnimatePresence>
                  {selectedEventId === event.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-[#F0F2F5] bg-[#F8F9FA]/50"
                    >
                      <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[11px] font-bold uppercase text-[#606770] tracking-wider">Event Schedule / Seminars</h4>
                          <button 
                            onClick={() => document.getElementById('seminar-form')?.scrollIntoView({ behavior: 'smooth' })}
                            className="text-[11px] font-bold text-[#1976D2] hover:underline"
                          >
                            + Add New Seminar
                          </button>
                        </div>

                        <div className="space-y-2">
                          {loadingSeminars ? (
                            <div className="py-12 flex flex-col items-center justify-center text-[#606770] bg-[#F8F9FA] rounded-xl border border-dashed border-[#E4E6EB]">
                              <Loader2 className="w-8 h-8 animate-spin mb-2 opacity-20" />
                              <p className="text-[12px] font-bold uppercase tracking-widest">Fetching schedule...</p>
                            </div>
                          ) : seminarsForSelectedEvent.length === 0 ? (
                            <div className="py-6 text-center text-[12px] text-[#606770] italic">No seminars scheduled for this expo.</div>
                          ) : (
                            seminarsForSelectedEvent.map(sem => (
                              <div key={sem.id} className="flex items-center justify-between p-3 bg-white border border-[#E4E6EB] rounded-lg shadow-sm">
                                <div className="flex-grow">
                                  <div className="text-[13px] font-bold text-[#1C1E21]">{sem.title}</div>
                                  <div className="text-[11px] text-[#606770] flex items-center gap-2 mt-0.5">
                                    <span className="font-semibold text-[#D32F2F]">{sem.time}</span>
                                    <span>•</span>
                                    <span className="bg-[#F0F2F5] px-1.5 py-0.5 rounded text-[9px] font-bold text-[#1976D2] uppercase">{sem.category}</span>
                                    <span>•</span>
                                    <span>{sem.speaker}</span>
                                    <span>•</span>
                                    <span>{sem.room}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button 
                                    onClick={() => handleEditSeminarInit(sem)}
                                    className="p-1.5 text-[#606770] hover:text-[#1976D2] transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => setDeletingSeminarId(sem.id)}
                                    className="p-1.5 text-[#606770] hover:text-[#D32F2F] transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
          <div>
            <h2 className="text-2xl font-bold text-[#1C1E21] tracking-tight">Event Registrants</h2>
            {registrants.length > 0 && (
              <p className="text-[11px] font-bold text-[#606770] uppercase mt-1">
                Showing {registrants.length} total registration{registrants.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={handleExportCSV}
              disabled={registrants.length === 0}
              className="px-4 py-2 bg-[#1976D2] text-white text-[13px] font-bold rounded-xl hover:bg-black transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <select 
              value={targetEventForReport}
              onChange={(e) => setTargetEventForReport(e.target.value)}
              className="bg-[#F0F2F5] border border-[#E4E6EB] rounded-xl px-4 py-2 text-[13px] font-semibold outline-none focus:border-[#1976D2] min-w-[220px] transition-all"
            >
              <option value="">Select event to view list...</option>
              <option value="all">Show All Events</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name} ({ev.city})</option>
              ))}
            </select>

            <div className="flex bg-[#F0F2F5] p-1 rounded-xl border border-[#E4E6EB]">
              {[
                { id: 'all', label: 'All' },
                { id: 'confirmed', label: 'Confirmed' },
                { id: 'pending', label: 'Pending' },
                { id: 'cancelled', label: 'Cancelled' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all",
                    statusFilter === tab.id 
                      ? "bg-white text-[#1976D2] shadow-sm" 
                      : "text-[#606770] hover:text-[#1C1E21]"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-hidden border border-[#F0F2F5] rounded-xl">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#F8F9FA] text-[#606770] font-bold uppercase text-[10px] border-b border-[#F0F2F5]">
              <tr>
                <th className="px-4 py-3">Registrant Name</th>
                <th className="px-4 py-3">Event Name</th>
                <th className="px-4 py-3">Registration Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2F5]">
              {loadingReport ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16">
                    <div className="flex flex-col items-center justify-center text-[#606770]">
                      <Loader2 className="w-10 h-10 animate-spin mb-4 opacity-10" />
                      <p className="text-[14px] font-bold uppercase tracking-widest opacity-50">Compiling Registrant List...</p>
                    </div>
                  </td>
                </tr>
              ) : registrants.length > 0 ? (
                registrants.map((reg, idx) => (
                  <tr key={idx} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#1C1E21]">{reg.userName || 'Anonymous User'}</div>
                      <div className="text-[11px] text-[#606770]">{reg.userEmail || 'No email provided'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#1C1E21]">{reg.eventName || 'Unknown Event'}</div>
                    </td>
                    <td className="px-4 py-3 text-[#606770]">
                      {reg.registeredAt ? format(new Date(reg.registeredAt), 'MMM dd, yyyy p') : 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={reg.status || 'confirmed'}
                        disabled={saving}
                        onChange={(e) => handleUpdateRegStatus(reg.path, e.target.value)}
                        className={cn(
                          "px-2 py-0.5 rounded font-bold text-[10px] uppercase border-none focus:ring-2 focus:ring-[#1976D2] outline-none cursor-pointer transition-all",
                          reg.status === 'confirmed' ? "bg-[#E8F5E9] text-[#2E7D32]" : 
                          reg.status === 'pending' ? "bg-[#FFF3E0] text-[#E65100]" :
                          "bg-[#FFF5F5] text-[#D32F2F]"
                        )}
                      >
                        <option value="confirmed">Confirmed</option>
                        <option value="pending">Pending</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button 
                          onClick={() => setDeletingReg(reg)}
                          className="p-1.5 text-[#606770] hover:text-[#D32F2F] transition-colors"
                          title="Cancel Registration"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[#606770] italic">
                    {targetEventForReport ? "No users have registered for this event yet." : "Please select an event to view the registration list."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reg Delete Confirm Modal */}
      <AnimatePresence>
        {deletingReg && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-[#FFF5F5] text-[#D32F2F] rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-[#1C1E21] mb-2">Cancel Registration?</h3>
              <p className="text-[14px] text-[#606770] mb-8">
                Are you sure you want to remove <span className="font-bold text-[#1C1E21]">{deletingReg.userName}</span> from <span className="font-bold text-[#1C1E21]">{deletingReg.eventName}</span>? 
                This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingReg(null)}
                  className="flex-grow py-3 bg-[#F0F2F5] text-[#1C1E21] font-bold rounded-xl hover:bg-[#E4E6EB]"
                >
                  Keep
                </button>
                <button 
                  onClick={() => handleDeleteReg(deletingReg.path)}
                  disabled={saving}
                  className="flex-grow py-3 bg-[#D32F2F] text-white font-bold rounded-xl hover:bg-black disabled:opacity-50"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Seminar Creator */}
      <div id="seminar-form" className="bg-white rounded-lg border border-[#E4E6EB] shadow-sm p-8">
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
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Category</label>
              <select 
                value={sCategory}
                onChange={(e) => setSCategory(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2]"
              >
                <option value="">Select Category...</option>
                <option value="Scholarships">Scholarships</option>
                <option value="Admissions">Admissions</option>
                <option value="Career Advice">Career Advice</option>
                <option value="Financial Aid">Financial Aid</option>
                <option value="Student Life">Student Life</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-[#606770] mb-1.5">Brief Description / Session Overview</label>
              <textarea 
                value={sDescription}
                onChange={(e) => setSDescription(e.target.value)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded px-4 py-2 text-[14px] outline-none focus:border-[#1976D2] min-h-[80px] resize-none"
                placeholder="Details about what will be covered in this session..."
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="submit"
              disabled={saving}
              className="w-full md:w-auto px-8 py-3 bg-[#1976D2] text-white font-bold rounded hover:bg-black transition-colors disabled:opacity-50"
            >
              {saving ? 'Processing...' : editingSeminarId ? 'Update Seminar' : 'Publish Seminar'}
            </button>
            {editingSeminarId && (
              <button 
                type="button"
                onClick={handleCancelSeminarEdit}
                className="px-6 py-3 bg-[#F0F2F5] text-[#606770] font-bold rounded hover:bg-[#E4E6EB]"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Seminar List for Selected Event (Summary View) */}
        {selectedEventId && seminarsForSelectedEvent.length > 0 && !editingSeminarId && (
          <div className="mt-8 pt-8 border-t border-[#F0F2F5]">
            <h4 className="text-[11px] font-bold uppercase text-[#606770] mb-4">Quick Preview: Seminars for Selected Event</h4>
            <div className="space-y-2">
              {seminarsForSelectedEvent.slice(0, 3).map(sem => (
                <div key={sem.id} className="flex items-center justify-between p-3 bg-[#F8F9FA] border border-[#E4E6EB] rounded-lg opacity-60">
                  <div className="flex-grow">
                    <div className="text-[13px] font-bold text-[#1C1E21]">{sem.title}</div>
                    <div className="text-[11px] text-[#606770]">{sem.time} • {sem.speaker}</div>
                  </div>
                </div>
              ))}
              {seminarsForSelectedEvent.length > 3 && (
                <div className="text-center text-[10px] text-[#606770] font-bold uppercase">+ {seminarsForSelectedEvent.length - 3} More Seminars (Manage them in the list above)</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Seminar Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingSeminarId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center"
            >
              <div className="w-12 h-12 bg-[#FFF5F5] text-[#D32F2F] rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#1C1E21] mb-2">Delete Seminar?</h3>
              <p className="text-[13px] text-[#606770] mb-6">Are you sure you want to delete this seminar? This cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingSeminarId(null)}
                  className="flex-grow py-2.5 bg-[#F0F2F5] text-[#1C1E21] font-bold rounded-lg hover:bg-[#E4E6EB]"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeleteSeminar(deletingSeminarId)}
                  className="flex-grow py-2.5 bg-[#D32F2F] text-white font-bold rounded-lg hover:bg-black"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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

const ProfileCompletionPrompt = ({ onGoToSettings }: { onGoToSettings: () => void }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#1976D2] text-white p-4 rounded-xl shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 mb-6"
    >
      <div className="flex items-center gap-4">
        <div className="bg-white/20 p-2 rounded-full">
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h4 className="font-bold text-[15px]">Complete Your Student Profile</h4>
          <p className="text-[12px] opacity-90">Please add your school and interests to unlock personalized scholarship recommendations.</p>
        </div>
      </div>
      <button 
        onClick={onGoToSettings}
        className="bg-white text-[#1976D2] px-5 py-2 rounded-lg font-bold text-[12px] whitespace-nowrap hover:bg-[#F0F2F5] transition-colors"
      >
        Go to Settings
      </button>
    </motion.div>
  );
};

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

const NotificationBroadcaster = () => {
  const { user } = useContext(UserContext);
  const [audience, setAudience] = useState<'all' | 'role' | 'individual'>('role');
  const [targetRole, setTargetRole] = useState<Role>('student');
  const [targetId, setTargetId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'alert' | 'update' | 'reminder'>('update');
  const [sending, setSending] = useState(false);

  if (user?.role !== 'admin') return null;

  const handleBroadcast = async () => {
    if (!title || !message) return alert('Please enter title and message');
    if (audience === 'individual' && !targetId) return alert('Please enter target user UID');

    setSending(true);
    try {
      let targetUids: string[] = [];

      if (audience === 'individual') {
        targetUids = [targetId];
      } else {
        const usersRef = collection(db, 'users');
        const q = audience === 'role' 
          ? query(usersRef, where('role', '==', targetRole))
          : usersRef;
        
        const snapshot = await getDocs(q);
        targetUids = snapshot.docs.map(doc => doc.id);
      }

      if (targetUids.length === 0) {
        alert('No target users found for selected audience.');
        setSending(false);
        return;
      }

      // Process in batches of 500 (Firestore limit)
      const batches = [];
      for (let i = 0; i < targetUids.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = targetUids.slice(i, i + 500);
        
        chunk.forEach(uid => {
          const notifRef = doc(collection(db, `users/${uid}/notifications`));
          batch.set(notifRef, {
            title,
            message,
            type,
            read: false,
            createdAt: new Date().toISOString()
          });
        });
        batches.push(batch.commit());
      }

      await Promise.all(batches);
      alert(`Successfully broadcasted to ${targetUids.length} users!`);
      setTitle('');
      setMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'broadcast_notifications');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-[#E4E6EB] p-6 shadow-sm mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-5 h-5 text-[#D32F2F]" />
        <h3 className="text-[14px] font-bold text-[#1C1E21] uppercase tracking-wider">Broadcast System Notification</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#606770] mb-1.5">Target Audience</label>
            <div className="flex gap-2 p-1 bg-[#F0F2F5] rounded-lg">
              {['role', 'all', 'individual'].map((target) => (
                <button
                  key={target}
                  onClick={() => setAudience(target as any)}
                  className={cn(
                    "flex-grow py-1.5 text-[11px] font-bold uppercase rounded-md transition-all capitalize",
                    audience === target ? "bg-white text-[#1976D2] shadow-sm" : "text-[#606770] hover:text-[#1C1E21]"
                  )}
                >
                  {target}
                </button>
              ))}
            </div>
          </div>

          {audience === 'role' && (
            <div>
              <label className="block text-[10px] font-bold uppercase text-[#606770] mb-1.5">Target Role</label>
              <select 
                value={targetRole} 
                onChange={(e) => setTargetRole(e.target.value as Role)}
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1976D2]"
              >
                <option value="student">Students</option>
                <option value="parent">Parents</option>
                <option value="admin">Administrators</option>
              </select>
            </div>
          )}

          {audience === 'individual' && (
            <div>
              <label className="block text-[10px] font-bold uppercase text-[#606770] mb-1.5">User UID</label>
              <input 
                type="text" 
                value={targetId} 
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="Paste UID here..."
                className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1976D2]"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase text-[#606770] mb-1.5">Notification Type</label>
            <div className="flex gap-3">
              {(['update', 'alert', 'reminder'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="notifType" 
                    value={t} 
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="sr-only"
                  />
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                    type === t ? "border-[#D32F2F] bg-[#D32F2F]" : "border-[#CCC] group-hover:border-[#606770]"
                  )}>
                    {type === t && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <span className={cn(
                    "text-[12px] font-bold capitalize",
                    type === t ? "text-[#1C1E21]" : "text-[#606770]"
                  )}>{t}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#606770] mb-1.5">Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Schedule Change for LA Expo"
              className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1976D2]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#606770] mb-1.5">Message Content</label>
            <textarea 
              value={message} 
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Detailed explanation of the announcement..."
              rows={4}
              className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1976D2] resize-none"
            />
          </div>
          <button 
            onClick={handleBroadcast}
            disabled={sending}
            className="w-full py-3 bg-[#D32F2F] text-white font-bold rounded-lg text-[13px] uppercase tracking-widest hover:bg-black transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                Broadcast to Audience
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const ScholarshipTracker = () => {
  const { user } = useContext(UserContext);
  const [apps, setApps] = useState<ScholarshipApplication[]>([
    { id: '1', name: 'NCRF STEM Scholarship', provider: 'NCRF Foundation', amount: 5000, deadline: '2026-11-15', status: 'pending' },
    { id: '2', name: 'Future Leaders Grant', provider: 'Community Trust', amount: 2500, deadline: '2026-12-01', status: 'draft' },
    { id: '3', name: 'Academic Excellence Award', provider: 'City Council', amount: 1000, deadline: '2026-04-10', status: 'awarded' },
  ]);

  const stats = {
    totalAwarded: apps.filter(a => a.status === 'awarded').reduce((acc, curr) => acc + curr.amount, 0),
    pendingAmount: apps.filter(a => a.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0),
    upcomingDeadlines: apps.filter(a => (a.status === 'draft' || a.status === 'pending') && new Date(a.deadline) > new Date()).length
  };

  if (user?.role !== 'student') return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-[#E4E6EB] shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-[#606770] tracking-widest mb-0.5">Total Awarded</div>
            <div className="text-2xl font-black text-[#1C1E21] tracking-tight">${stats.totalAwarded.toLocaleString()}</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-[#E4E6EB] shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
          <div className="w-12 h-12 bg-[#FFF5F5] text-[#D32F2F] rounded-2xl flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-[#606770] tracking-widest mb-0.5">Pending Potential</div>
            <div className="text-2xl font-black text-[#1C1E21] tracking-tight">${stats.pendingAmount.toLocaleString()}</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-[#E4E6EB] shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
          <div className="w-12 h-12 bg-[#E3F2FD] text-[#1976D2] rounded-2xl flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-[#606770] tracking-widest mb-0.5">Active Tasks</div>
            <div className="text-2xl font-black text-[#1C1E21] tracking-tight">{stats.upcomingDeadlines}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-2xl border border-[#E4E6EB] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-[#F0F2F5] flex items-center justify-between bg-white">
          <div>
            <h3 className="font-black text-[#1C1E21] text-lg tracking-tight">Application Tracker</h3>
            <p className="text-[12px] text-[#606770] font-medium">Manage and track your funding progress.</p>
          </div>
          <button className="px-4 py-2 bg-[#1A2233] text-white text-[11px] font-black rounded-xl hover:bg-black flex items-center gap-2 transition-all shadow-lg active:scale-95 uppercase tracking-wider">
            <Plus className="w-4 h-4" />
            Add New App
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase text-[#606770] tracking-[0.15em] border-b border-[#F0F2F5]">
                <th className="px-6 py-5">Scholarship Name</th>
                <th className="px-6 py-5">Provider</th>
                <th className="px-6 py-5">Amount</th>
                <th className="px-6 py-5">Deadline</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2F5]">
              {apps.map((app) => (
                <tr key={app.id} className="hover:bg-[#F8F9FA]/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="text-[14px] font-bold text-[#1C1E21] group-hover:text-[#1976D2] transition-colors">{app.name}</div>
                  </td>
                  <td className="px-6 py-5 text-[13px] text-[#606770] font-medium">{app.provider}</td>
                  <td className="px-6 py-5">
                    <div className="text-[13px] font-extrabold text-[#1C1E21]">${app.amount.toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-5">
                    <div className={cn(
                      "text-[12px] font-bold",
                      new Date(app.deadline) < new Date() ? "text-[#D32F2F]" : "text-[#1C1E21]"
                    )}>
                      {format(new Date(app.deadline), 'MMM dd, yyyy')}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={cn(
                      "text-[9px] uppercase font-black px-2.5 py-1 rounded-full border shadow-sm",
                      app.status === 'awarded' && "bg-[#E8F5E9] text-[#2E7D32] border-[#2E7D32]/10",
                      app.status === 'pending' && "bg-[#E3F2FD] text-[#1565C0] border-[#1565C0]/10",
                      app.status === 'rejected' && "bg-[#FFEBEE] text-[#C62828] border-[#C62828]/10",
                      app.status === 'draft' && "bg-[#F5F5F5] text-[#616161] border-[#616161]/10"
                    )}>
                      {app.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 hover:bg-[#E4E6EB] rounded-lg text-[#606770] transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-[#F8F9FA] border-t border-[#F0F2F5] text-center">
           <button className="text-[11px] font-bold text-[#1976D2] hover:underline uppercase tracking-widest">
             View Archived Applications
           </button>
        </div>
      </div>
    </div>
  );
};

const Navbar = ({ onOpenNotifications }: { onOpenNotifications: () => void }) => {
  const { user, logout, notifications } = useContext(UserContext);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="h-[70px] bg-white border border-[#E4E6EB] rounded-lg flex items-center justify-between px-5 mb-4 shadow-sm">
      <div className="flex items-center gap-4">
        <img 
          src={LOGO_URL} 
          alt="NCRF Logo" 
          className="h-10 w-auto" 
          referrerPolicy="no-referrer"
        />
        <div className="hidden md:block">
          <div className="font-black text-lg text-[#D32F2F] tracking-tighter uppercase">
            NCRF Foundation
          </div>
          <div className="text-[10px] font-bold text-[#606770] uppercase tracking-widest -mt-1">
            Los Angeles Expo 2026
          </div>
        </div>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [showSponsorsOnly, setShowSponsorsOnly] = useState(false);

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

  const filteredBooths = booths.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (!showSponsorsOnly || b.premium)
  );

  return (
    <div className="bg-white rounded-lg border border-[#E4E6EB] p-5 flex flex-col h-full shadow-sm relative">
      <div className="text-[11px] font-bold uppercase text-[#606770] mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span>Main Floor Layout</span>
          <button 
            onClick={() => setShowSponsorsOnly(!showSponsorsOnly)}
            className={cn(
              "px-2 py-0.5 rounded border transition-all flex items-center gap-1",
              showSponsorsOnly 
                ? "bg-[#1976D2] border-[#1976D2] text-white" 
                : "bg-white border-[#E4E6EB] text-[#606770] hover:border-[#1976D2]"
            )}
          >
            <Star className={cn("w-3 h-3", showSponsorsOnly ? "fill-white" : "")} />
            Sponsors Only
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#606770]" />
          <input 
            type="text" 
            placeholder="Search booths..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-[#F0F2F5] border border-transparent rounded-lg text-[12px] outline-none focus:border-[#1976D2] w-full md:w-48 placeholder:text-[#606770]/60"
          />
        </div>
      </div>
      
      <div className="flex-grow bg-[#F8F9FA] border border-dashed border-[#CCC] rounded relative overflow-hidden">
        <TransformWrapper
          initialScale={1}
          initialPositionX={0}
          initialPositionY={0}
          minScale={0.5}
          maxScale={3}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Zoom Controls */}
              <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                <button 
                  onClick={() => zoomIn()}
                  className="p-2 bg-white border border-[#E4E6EB] rounded-lg shadow-sm hover:bg-[#F0F2F5] transition-colors text-[#606770]"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => zoomOut()}
                  className="p-2 bg-white border border-[#E4E6EB] rounded-lg shadow-sm hover:bg-[#F0F2F5] transition-colors text-[#606770]"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => resetTransform()}
                  className="p-2 bg-white border border-[#E4E6EB] rounded-lg shadow-sm hover:bg-[#F0F2F5] transition-colors text-[#606770]"
                  title="Reset View"
                >
                  <RefreshCcw className="w-4 h-4" />
                </button>
              </div>

              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%", padding: "20px" }}
              >
                <div className="grid grid-cols-4 md:grid-cols-6 gap-3 w-full">
                  {filteredBooths.length > 0 ? (
                    filteredBooths.map((booth, i) => (
                      <motion.div 
                        key={i} 
                        whileHover={{ scale: 1.05, zIndex: 10 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedBooth(booth)}
                        className={cn(
                          "flex items-center justify-center text-[10px] text-center p-2 font-medium border border-[#E4E6EB] transition-all cursor-pointer shadow-sm min-h-[60px]",
                          booth.premium ? "bg-[#E3F2FD] border-[#1976D2] text-[#1976D2] font-bold" : "bg-white text-[#606770] hover:border-[#1976D2]"
                        )}
                      >
                        {booth.name}
                      </motion.div>
                    ))
                  ) : (
                    <div className="col-span-full flex flex-col items-center justify-center text-[#606770] opacity-50 py-12">
                      <Search className="w-8 h-8 mb-2" />
                      <span className="text-[12px] font-bold">
                        {showSponsorsOnly 
                          ? `No sponsors matching "${searchQuery}"` 
                          : `No booths matching "${searchQuery}"`}
                      </span>
                    </div>
                  )}
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>

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

const DateCard: React.FC<{ month: string, day: string, city: string, active?: boolean, isSaved?: boolean, onClick?: () => void }> = ({ month, day, city, active, isSaved, onClick }) => (
  <div 
    onClick={onClick}
    className={cn(
      "min-w-[140px] border border-[#E4E6EB] rounded-lg p-3 flex flex-col items-center transition-all cursor-pointer hover:shadow-md relative",
      active ? "border-[#D32F2F] bg-[#FFF5F5]" : "bg-white"
    )}
  >
    {isSaved && (
      <div className="absolute top-2 right-2 flex items-center justify-center">
        <Bookmark className="w-3.5 h-3.5 fill-[#1976D2] text-[#1976D2]" />
      </div>
    )}
    <span className="text-[10px] uppercase font-bold text-[#606770]">{month}</span>
    <span className="text-2xl font-extrabold my-1">{day}</span>
    <span className="text-[12px] font-semibold">{city}</span>
  </div>
);

const Dashboard = ({ events, onSelectEvent }: { events: ExpoEvent[], onSelectEvent: (event: ExpoEvent) => void }) => {
  const { user } = useContext(UserContext);
  const [activeFilter, setActiveFilter] = useState<'all' | 'saved'>('all');

  if (!user) return null;

  const displayEvents = activeFilter === 'all' 
    ? events 
    : events.filter(e => user.savedEvents?.includes(e.id));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* Filters Overlay/Row */}
      <div className="lg:col-span-2 flex items-center justify-between bg-white p-3 border border-[#E4E6EB] rounded-lg shadow-sm">
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'All Expos', icon: Calendar },
            { id: 'saved', label: 'My Saved', icon: Bookmark }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-2",
                activeFilter === tab.id 
                  ? "bg-[#1976D2] text-white shadow-md shadow-[#1976D2]/20" 
                  : "text-[#606770] hover:bg-[#F0F2F5] hover:text-[#1C1E21]"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.id === 'saved' && user.savedEvents && user.savedEvents.length > 0 && (
                <span className={cn(
                  "ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black",
                  activeFilter === 'saved' ? "bg-white text-[#1976D2]" : "bg-[#1976D2] text-white"
                )}>
                  {user.savedEvents.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="text-[11px] font-bold text-[#606770] italic hidden sm:block">
          {activeFilter === 'all' ? 'Browse all upcoming college fairs' : 'View events you have bookmarked'}
        </div>
      </div>

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
        {displayEvents.length === 0 ? (
          <div className="py-8 px-4 text-center w-full opacity-40 italic text-[13px]">
            {activeFilter === 'all' ? 'No upcoming events scheduled.' : 'You haven\'t saved any events yet.'}
          </div>
        ) : (
          displayEvents.map((event) => {
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
                isSaved={user.savedEvents?.includes(event.id)}
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

const CalendarView = ({ events, onSelectEvent }: { events: ExpoEvent[], onSelectEvent: (event: ExpoEvent) => void }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  
  const days = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-white rounded-lg border border-[#E4E6EB] shadow-sm overflow-hidden"
    >
      <div className="p-4 border-b border-[#E4E6EB] flex items-center justify-between bg-[#F8F9FA]">
        <h3 className="text-[14px] font-bold text-[#1C1E21]">{format(currentDate, 'MMMM yyyy')}</h3>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-1.5 hover:bg-[#E4E6EB] rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-[#606770]" />
          </button>
          <button onClick={nextMonth} className="p-1.5 hover:bg-[#E4E6EB] rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4 text-[#606770]" />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 border-b border-[#E4E6EB]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="py-2 text-center text-[10px] font-bold uppercase text-[#606770] bg-white">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-[#E4E6EB]">
        {days.map((day, i) => {
          const dayEvents = events.filter(e => isSameDay(parseISO(e.date), day));
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isToday = isSameDay(day, new Date());

          return (
            <div 
              key={i} 
              className={cn(
                "min-h-[100px] p-2 bg-white flex flex-col gap-1",
                !isCurrentMonth && "bg-[#F8F9FA] opacity-40"
              )}
            >
              <div className={cn(
                "text-[12px] font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                isToday ? "bg-[#D32F2F] text-white" : "text-[#1C1E21]"
              )}>
                {format(day, 'd')}
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto max-h-[70px] no-scrollbar">
                {dayEvents.map(event => (
                  <button
                    key={event.id}
                    onClick={() => onSelectEvent(event)}
                    className="text-[9px] font-bold text-left px-1.5 py-1 bg-[#E3F2FD] text-[#1976D2] border-l-2 border-[#1976D2] rounded truncate hover:bg-[#1976D2] hover:text-white transition-colors"
                  >
                    {event.city} Expo
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default function App() {
  const [fUser, setFUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsRole, setNeedsRole] = useState(false);
  const [dashboardMode, setDashboardMode] = useState<'list' | 'calendar'>('list');
  const [selectedEvent, setSelectedEvent] = useState<ExpoEvent | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'settings' | 'management' | 'broadcast' | 'scholarship' | 'resources'>('dashboard');
  const [events, setEvents] = useState<ExpoEvent[]>([]);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<ExpoEvent | null>(null);

  // Manual Auth State
  const [authMode, setAuthMode] = useState<'google' | 'manual'>('google');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let unsubscribeNotifs: (() => void) | null = null;
    let unsubscribeEvents: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setFUser(firebaseUser);
      if (firebaseUser) {
        // User Profile Listener
        const unsubscribeUser = onSnapshot(doc(db, 'users', firebaseUser.uid), (userDoc) => {
          if (userDoc.exists()) {
            setUser(userDoc.data() as AppUser);
            setNeedsRole(false);
          } else {
            setNeedsRole(true);
            setUser(null);
          }
        });

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

        // Events listener (Global)
        const qEvents = query(collection(db, 'events'), orderBy('date', 'asc'));
        unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
          const fetchedEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpoEvent));
          setEvents(fetchedEvents);
        });

        // Cleanup user listener on auth change
        return () => {
          unsubscribeUser();
          if (unsubscribeNotifs) unsubscribeNotifs();
          if (unsubscribeEvents) unsubscribeEvents();
        };

      } else {
        setUser(null);
        setNeedsRole(false);
        setNotifications([]);
        setEvents([]);
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

  const handleSignIn = async (provider: any = googleProvider) => {
    setAuthError('');
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in popup closed. Please try again.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore
      } else if (error.code === 'auth/popup-blocked') {
        setAuthError('Popup blocked by browser. Please allow popups.');
      } else {
        console.error('Sign in failed', error);
        setAuthError('Sign in failed. Try opening in a new tab.');
      }
    }
  };

  const handleFacebookSignIn = () => handleSignIn(facebookProvider);
  const handleAppleSignIn = () => handleSignIn(appleProvider);

  const handleManualAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!manualEmail || !manualPassword) return setAuthError('Please fill all fields');
    if (manualPassword.length < 6) return setAuthError('Password must be at least 6 characters');

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, manualEmail, manualPassword);
      } else {
        await signInWithEmailAndPassword(auth, manualEmail, manualPassword);
      }
    } catch (error: any) {
      console.error('Manual auth error:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setAuthError('Invalid email or password');
      } else if (error.code === 'auth/email-already-in-use') {
        setAuthError('Email already registered');
      } else if (error.code === 'auth/invalid-email') {
        setAuthError('Invalid email address');
      } else {
        setAuthError(error.message);
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

  const isProfileIncomplete = user && (user.role === 'student' || user.role === 'parent') && (!user.school || !user.interests || user.interests.length === 0);

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
              <div className="pb-6 border-b border-white/10 mb-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-lg border border-white/10">
                    <img src={LOGO_URL} alt="NCRF" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <div className="text-[12px] font-black tracking-tight leading-none">NCRF EXPO</div>
                    <div className="text-[9px] opacity-40 font-bold tracking-tighter">PORTAL SYSTEM</div>
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#1976D2] mb-1">
                  {user.role} Portal
                </div>
                <div className="text-base font-semibold truncate">{user.displayName}</div>
                <div className="text-[11px] opacity-60 mt-1">NCRF Foundation</div>
              </div>
              <nav className="flex-grow">
                <ul className="space-y-1">
                  {[
                    { label: 'Event Dashboard', active: activeView === 'dashboard' && !selectedEvent, onClick: () => { setSelectedEvent(null); setActiveView('dashboard'); setEventToEdit(null); }, roles: ['student', 'parent', 'admin'] },
                    { label: 'My Scholarship Path', active: activeView === 'scholarship', onClick: () => setActiveView('scholarship'), roles: ['student'] },
                    { label: 'Guidance Resources', active: activeView === 'resources', onClick: () => setActiveView('resources'), roles: ['parent'] },
                    { label: 'Event Management', active: activeView === 'management', onClick: () => { setActiveView('management'); setEventToEdit(null); }, roles: ['admin'] },
                    { label: 'Broadcast Hub', active: activeView === 'broadcast', onClick: () => setActiveView('broadcast'), roles: ['admin'] },
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
                    
                    <motion.div
                       initial={{ opacity: 0, scale: 0.8 }}
                       animate={{ opacity: 1, scale: 1 }}
                       className="mb-10"
                     >
                       <img 
                        src={LOGO_URL} 
                        alt="NCRF Foundation" 
                        className="h-32 w-auto drop-shadow-2xl" 
                        referrerPolicy="no-referrer"
                       />
                     </motion.div>
                     <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-[#1C1E21] mb-6 leading-[0.9]">
                      National College Resources <br />
                      <span className="text-[#D32F2F]">Foundation Portal</span>
                    </h1>
                    
                    <p className="text-base text-[#606770] mb-8 font-medium max-w-lg mx-auto">
                      Access scholarship opportunities, college resources, and event maps. Start your educational journey today.
                    </p>
                    
                    <div className="w-full max-w-sm mx-auto">
                      {authError && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg text-left animate-shake">
                          {authError}
                        </div>
                      )}

                      {authMode === 'google' ? (
                        <div className="space-y-3">
                          <button 
                            onClick={() => handleSignIn()}
                            className="w-full h-[48px] bg-white border border-[#E4E6EB] text-[#1C1E21] font-bold rounded-lg flex items-center justify-center gap-3 hover:bg-[#F0F2F5] transition-all shadow-sm"
                          >
                            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" referrerPolicy="no-referrer" />
                            Continue with Google
                          </button>

                          <button 
                            onClick={handleFacebookSignIn}
                            className="w-full h-[48px] bg-[#1877F2] text-white font-bold rounded-lg flex items-center justify-center gap-3 hover:bg-[#166fe5] transition-all shadow-sm"
                          >
                            <Facebook className="w-4 h-4" />
                            Continue with Facebook
                          </button>

                          <button 
                            onClick={handleAppleSignIn}
                            className="w-full h-[48px] bg-black text-white font-bold rounded-lg flex items-center justify-center gap-3 hover:bg-[#1C1E21] transition-all shadow-sm"
                          >
                            <Apple className="w-4 h-4 fill-current" />
                            Continue with Apple
                          </button>
                          
                          <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#E4E6EB]"></div></div>
                            <div className="relative flex justify-center text-[11px] uppercase tracking-widest"><span className="bg-[#F0F2F5] px-2 text-[#8A8D91] font-bold">Or</span></div>
                          </div>

                          <button 
                            onClick={() => setAuthMode('manual')}
                            className="w-full h-[48px] bg-[#1A2233] text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-black transition-all shadow-md"
                          >
                            <Mail className="w-4 h-4" />
                            Use Email Address
                          </button>
                        </div>
                      ) : (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="bg-white border border-[#E4E6EB] p-8 rounded-2xl shadow-sm text-left relative overflow-hidden"
                        >
                          <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 bg-[#F8F9FA] rounded-lg flex items-center justify-center p-1.5 border border-[#E4E6EB]">
                              <img src={LOGO_URL} alt="NCRF" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                            </div>
                            <div>
                               <h3 className="text-[16px] font-black text-[#1C1E21] leading-none uppercase tracking-tighter">NCRF Portal</h3>
                               <p className="text-[10px] font-bold text-[#606770] uppercase tracking-widest mt-0.5">{isSignUp ? 'New Account' : 'Member Login'}</p>
                            </div>
                          </div>
                          
                          <form onSubmit={handleManualAuth} className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase text-[#606770] tracking-wider pl-1 font-mono">Email Address</label>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8D91]" />
                                <input 
                                  type="email" 
                                  value={manualEmail}
                                  onChange={(e) => setManualEmail(e.target.value)}
                                  className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded-xl pl-10 pr-4 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2] transition-all"
                                  placeholder="name@school.edu"
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase text-[#606770] tracking-wider pl-1 font-mono">Password</label>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8D91]" />
                                <input 
                                  type="password" 
                                  value={manualPassword}
                                  onChange={(e) => setManualPassword(e.target.value)}
                                  className="w-full bg-[#F0F2F5] border border-[#E4E6EB] rounded-xl pl-10 pr-4 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-[#1976D2]/20 focus:border-[#1976D2] transition-all"
                                  placeholder="••••••••"
                                />
                              </div>
                            </div>

                            <button 
                              type="submit"
                              className="w-full py-3 bg-[#D32F2F] text-white font-bold rounded-xl hover:bg-black transition-all shadow-lg active:scale-[0.98] mt-2"
                            >
                              {isSignUp ? 'Sign Up for Expo' : 'Log In to Portal'}
                            </button>

                            <div className="pt-2 text-center text-[12px]">
                              <button 
                                type="button" 
                                onClick={() => setIsSignUp(!isSignUp)}
                                className="text-[#1976D2] font-semibold hover:underline"
                              >
                                {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
                              </button>
                            </div>
                          </form>
                          
                          <button 
                            onClick={() => { setAuthMode('google'); setAuthError(''); }}
                            className="w-full mt-6 text-[11px] font-bold text-[#606770] hover:text-[#1C1E21] flex items-center justify-center gap-1 uppercase tracking-widest"
                          >
                            <ChevronLeft className="w-3 h-3" /> Back to Social Login
                          </button>
                        </motion.div>
                      )}
                    </div>

                    <p className="mt-8 text-[11px] text-[#606770] opacity-60 max-w-xs mx-auto">
                      By continuing, you agree to NCRF's Terms of Service and Privacy Policy.
                    </p>
                  </section>
                )
              ) : (
                <>
                  <Navbar onOpenNotifications={() => setIsNotificationsOpen(true)} />
                  {isProfileIncomplete && activeView !== 'settings' && (
                    <ProfileCompletionPrompt onGoToSettings={() => setActiveView('settings')} />
                  )}
                  {activeView === 'settings' ? (
                    <ProfileSettings user={user} onUpdate={handleUpdateProfile} />
                  ) : activeView === 'scholarship' && user?.role === 'student' ? (
                    <div className="max-w-5xl mx-auto py-6">
                      <div className="mb-8">
                        <h2 className="text-3xl font-black text-[#1C1E21] tracking-tight">Scholarship Center</h2>
                        <p className="text-[#606770] mt-1 font-medium italic">Empowering your future, one application at a time.</p>
                      </div>
                      <ScholarshipTracker />
                    </div>
                  ) : activeView === 'resources' && user?.role === 'parent' ? (
                    <div className="max-w-4xl mx-auto py-10">
                      <div className="mb-8">
                        <h2 className="text-3xl font-extrabold text-[#1C1E21]">Parental Guidance Resources</h2>
                        <p className="text-[#606770] mt-2">Supporting your child's journey to college success.</p>
                      </div>
                      <div className="bg-white rounded-2xl border border-[#E4E6EB] p-12 text-center shadow-sm">
                        <Users className="w-12 h-12 text-[#1976D2] mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-[#1C1E21] mb-2">Resource Library Under Preparation</h3>
                        <p className="text-[#606770] max-w-sm mx-auto text-[14px]">Access exclusive webinars, checklists, and expert advice specifically curated for parents and guardians.</p>
                      </div>
                    </div>
                  ) : activeView === 'management' && user?.role === 'admin' ? (
                    <AdminEventManager events={events} initialEditEvent={eventToEdit} />
                  ) : activeView === 'broadcast' && user?.role === 'admin' ? (
                    <div className="max-w-4xl mx-auto">
                      <div className="mb-8">
                        <h2 className="text-3xl font-extrabold text-[#1C1E21] tracking-tight">Broadcast Center</h2>
                        <p className="text-[#606770] mt-2 font-medium">Communicate urgent updates and announcements to the NCRF community.</p>
                      </div>
                      <NotificationBroadcaster />
                    </div>
                  ) : (activeView === 'management' || activeView === 'broadcast') && user?.role !== 'admin' ? (
                    <div className="flex flex-col items-center justify-center p-20 text-center">
                      <div className="w-16 h-16 bg-[#FFF5F5] text-[#D32F2F] rounded-full flex items-center justify-center mb-6">
                        <Lock className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-[#1C1E21] mb-2">Access Restricted</h3>
                      <p className="text-[14px] text-[#606770] max-w-sm mb-6">
                        You do not have the required permissions to access this administrative section.
                      </p>
                      <button 
                        onClick={() => setActiveView('dashboard')}
                        className="px-6 py-2 bg-[#1976D2] text-white font-bold rounded-lg text-[13px] hover:bg-[#1565C0] transition-all"
                      >
                        Return to Dashboard
                      </button>
                    </div>
                  ) : selectedEvent ? (
                    <EventDetails 
                      event={selectedEvent} 
                      onBack={() => { setSelectedEvent(null); setEventToEdit(null); }} 
                      onEdit={(e) => {
                        setEventToEdit(e);
                        setActiveView('management');
                        setSelectedEvent(null);
                      }}
                    />
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-black text-[#1C1E21] tracking-tight">Expo Dashboard</h2>
                        <div className="flex bg-white rounded-lg p-1 border border-[#E4E6EB] shadow-sm">
                          <button 
                            onClick={() => setDashboardMode('list')}
                            className={cn(
                              "px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-md transition-all",
                              dashboardMode === 'list' ? "bg-[#1A2233] text-white" : "text-[#606770] hover:bg-[#F0F2F5]"
                            )}
                          >
                            List View
                          </button>
                          <button 
                            onClick={() => setDashboardMode('calendar')}
                            className={cn(
                              "px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-md transition-all",
                              dashboardMode === 'calendar' ? "bg-[#1A2233] text-white" : "text-[#606770] hover:bg-[#F0F2F5]"
                            )}
                          >
                            Calendar
                          </button>
                        </div>
                      </div>

                      {dashboardMode === 'calendar' ? (
                        <CalendarView events={events} onSelectEvent={(e) => setSelectedEvent(e)} />
                      ) : (
                        <Dashboard events={events} onSelectEvent={(e) => setSelectedEvent(e)} />
                      )}
                    </div>
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
