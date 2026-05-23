import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, User, Shield, Lock, Eye, MapPin, Trash2, Plus, Home, Briefcase, Edit2, Check, X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

interface SavedPlace {
  id: string;
  type: "home" | "work" | "other";
  label?: string | null;
  address: string;
}

interface MeUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: string;
}

interface SettingsRow {
  safety_alerts?: boolean;
  share_emergency_contact?: boolean;
  hide_profile?: boolean;
  privacy_marketing_opt_in?: boolean;
  privacy_share_location?: boolean;
}

export default function Settings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"personal" | "safety" | "security" | "privacy" | "places" | "danger">("personal");
  const [user, setUser] = useState<MeUser | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [settings, setSettings] = useState({ safetyAlerts: true, shareEmergencyContact: false, hideProfile: false, marketingOptIn: true, shareLocation: true });
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [editingPlace, setEditingPlace] = useState<"home" | "work" | null>(null);
  const [placeDraft, setPlaceDraft] = useState("");
  const [newOtherPlace, setNewOtherPlace] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const homePlace = useMemo(() => savedPlaces.find((p) => p.type === "home") || null, [savedPlaces]);
  const workPlace = useMemo(() => savedPlaces.find((p) => p.type === "work") || null, [savedPlaces]);
  const otherPlaces = useMemo(() => savedPlaces.filter((p) => p.type === "other"), [savedPlaces]);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) { navigate("/auth"); return; }

    (async () => {
      try {
        const [meRes, settingsRes, placesRes] = await Promise.all([
          apiClient.getCurrentUser(),
          apiClient.getUserSettings(),
          apiClient.getSavedPlaces(),
        ]) as [{ user?: MeUser }, { settings?: SettingsRow }, { places?: SavedPlace[] }];
        const me = meRes?.user || null;
        setUser(me);
        setFullName(me?.fullName || "");
        setPhone(me?.phone || "");
        const row = (settingsRes?.settings || {}) as SettingsRow;
        setSettings({ safetyAlerts: row.safety_alerts ?? true, shareEmergencyContact: row.share_emergency_contact ?? false, hideProfile: row.hide_profile ?? false, marketingOptIn: row.privacy_marketing_opt_in ?? true, shareLocation: row.privacy_share_location ?? true });
        setSavedPlaces((placesRes?.places || []) as SavedPlace[]);
      } catch {
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const savePersonalInfo = async () => {
    try {
      setSavingProfile(true);
      await apiClient.updateMe({ fullName: fullName.trim() || null, phone: phone.trim() || null });
      const meRes = await apiClient.getCurrentUser();
      setUser(meRes?.user as MeUser || null);
      toast.success("Personal info updated");
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Failed to update");
    } finally {
      setSavingProfile(false);
    }
  };

  const upsertSavedPlace = async (type: "home" | "work", address: string) => {
    const trimmed = address.trim();
    if (!trimmed) { toast.error("Please enter an address"); return; }
    try {
      const existing = savedPlaces.find((p) => p.type === type);
      if (existing) {
        const res = await apiClient.updateSavedPlace(existing.id, { address: trimmed }) as { place?: SavedPlace };
        if (res?.place) setSavedPlaces((prev) => prev.map((p) => (p.id === existing.id ? res.place! : p)));
      } else {
        const res = await apiClient.addSavedPlace({ type, address: trimmed }) as { place?: SavedPlace };
        if (res?.place) setSavedPlaces((prev) => [res.place!, ...prev]);
      }
      toast.success(`${type === "home" ? "Home" : "Work"} location saved`);
      setEditingPlace(null);
      setPlaceDraft("");
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Failed to save place");
    }
  };

  const handleChangePassword = async () => {
    if (!pwCurrent || !pwNew) { toast.error("Enter current and new password"); return; }
    if (pwNew.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (pwNew !== pwNew2) { toast.error("New passwords do not match"); return; }
    try {
      setChangingPw(true);
      await apiClient.changePassword(pwCurrent, pwNew);
      setPwCurrent(""); setPwNew(""); setPwNew2("");
      toast.success("Password changed");
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Failed to change password");
    } finally {
      setChangingPw(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const tabs = [
    { id: "personal", label: "Personal Info", icon: User },
    { id: "safety", label: "Safety", icon: Shield },
    { id: "security", label: "Security", icon: Lock },
    { id: "privacy", label: "Privacy", icon: Eye },
    { id: "places", label: "Saved Places", icon: MapPin },
    { id: "danger", label: "Delete Account", icon: Trash2 },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-muted rounded-lg transition-colors flex items-center gap-1 text-primary text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="font-display font-bold text-xl">Settings</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all whitespace-nowrap text-sm ${
                activeTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground bg-card border border-border"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="bg-card rounded-2xl border border-border/50 p-6">
          {activeTab === "personal" && (
            <div className="space-y-4">
              <h2 className="font-semibold text-lg">Personal Information</h2>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input value={user?.email || ""} disabled className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-muted-foreground text-sm" />
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-4 py-2 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone Number</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254..." className="w-full px-4 py-2 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
              </div>
              <Button onClick={savePersonalInfo} disabled={savingProfile} className="bg-gradient-primary">
                {savingProfile && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-4">
              <h2 className="font-semibold text-lg">Change Password</h2>
              <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} placeholder="Current password" className="w-full px-4 py-2 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
              <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} placeholder="New password (min 8 chars)" className="w-full px-4 py-2 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
              <input type="password" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} placeholder="Confirm new password" className="w-full px-4 py-2 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
              <Button onClick={handleChangePassword} disabled={changingPw} className="bg-gradient-primary">
                {changingPw && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Change Password
              </Button>
            </div>
          )}

          {activeTab === "places" && (
            <div className="space-y-4">
              <h2 className="font-semibold text-lg">Saved Places</h2>
              {/* Home */}
              <div className="p-4 bg-secondary rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">Home</span>
                  </div>
                  <button onClick={() => { setEditingPlace("home"); setPlaceDraft(homePlace?.address || ""); }} className="text-xs text-primary hover:underline">
                    {homePlace ? "Edit" : "Add"}
                  </button>
                </div>
                {editingPlace === "home" ? (
                  <div className="flex gap-2">
                    <input value={placeDraft} onChange={(e) => setPlaceDraft(e.target.value)} placeholder="Enter home address" className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    <button onClick={() => upsertSavedPlace("home", placeDraft)} className="p-2 bg-primary rounded-lg"><Check className="w-4 h-4 text-white" /></button>
                    <button onClick={() => setEditingPlace(null)} className="p-2 bg-muted rounded-lg"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{homePlace?.address || "Not set"}</p>
                )}
              </div>
              {/* Work */}
              <div className="p-4 bg-secondary rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-accent" />
                    <span className="font-medium text-sm">Work</span>
                  </div>
                  <button onClick={() => { setEditingPlace("work"); setPlaceDraft(workPlace?.address || ""); }} className="text-xs text-primary hover:underline">
                    {workPlace ? "Edit" : "Add"}
                  </button>
                </div>
                {editingPlace === "work" ? (
                  <div className="flex gap-2">
                    <input value={placeDraft} onChange={(e) => setPlaceDraft(e.target.value)} placeholder="Enter work address" className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    <button onClick={() => upsertSavedPlace("work", placeDraft)} className="p-2 bg-primary rounded-lg"><Check className="w-4 h-4 text-white" /></button>
                    <button onClick={() => setEditingPlace(null)} className="p-2 bg-muted rounded-lg"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{workPlace?.address || "Not set"}</p>
                )}
              </div>
              {/* Other places */}
              {otherPlaces.map((p) => (
                <div key={p.id} className="p-4 bg-secondary rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">{p.address}</p>
                  </div>
                  <button onClick={async () => { await apiClient.deleteSavedPlace(p.id); setSavedPlaces((prev) => prev.filter((x) => x.id !== p.id)); toast.success("Location removed"); }}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={newOtherPlace} onChange={(e) => setNewOtherPlace(e.target.value)} placeholder="Add other location..." className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <Button size="sm" onClick={async () => { if (!newOtherPlace.trim()) return; const res = await apiClient.addSavedPlace({ type: "other", address: newOtherPlace.trim() }) as { place?: SavedPlace }; if (res?.place) { setSavedPlaces((p) => [res.place!, ...p]); setNewOtherPlace(""); toast.success("Place saved"); } }}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {activeTab === "danger" && (
            <div className="space-y-4">
              <h2 className="font-semibold text-lg text-destructive">Danger Zone</h2>
              <p className="text-sm text-muted-foreground">This action is permanent and cannot be undone.</p>
              {!showDeleteConfirm ? (
                <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>Delete Account</Button>
              ) : (
                <div className="space-y-3 p-4 border border-destructive/30 rounded-xl bg-destructive/5">
                  <p className="text-sm font-medium">Enter your password to confirm deletion:</p>
                  <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Your password" className="w-full px-4 py-2 rounded-xl bg-background border border-destructive/30 focus:outline-none focus:ring-2 focus:ring-destructive/50 text-sm" />
                  <div className="flex gap-3">
                    <Button variant="destructive" onClick={async () => { try { setDeleting(true); await apiClient.deleteAccount(deletePassword); await apiClient.logout(); toast.success("Account deleted"); navigate("/"); } catch (e: unknown) { toast.error((e as Error)?.message || "Failed"); } finally { setDeleting(false); } }} disabled={deleting || !deletePassword}>
                      {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Confirm Delete
                    </Button>
                    <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {(activeTab === "safety" || activeTab === "privacy") && (
            <div className="space-y-4">
              <h2 className="font-semibold text-lg capitalize">{activeTab} Settings</h2>
              <p className="text-sm text-muted-foreground">Configure your {activeTab} preferences in your account.</p>
              {activeTab === "safety" && (
                <div className="space-y-3">
                  {[
                    { key: "safetyAlerts", label: "Receive safety alerts", desc: "Get notified about suspicious activities" },
                    { key: "shareEmergencyContact", label: "Share emergency contact", desc: "Allow platform to contact your emergency contact" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between p-4 bg-secondary rounded-xl">
                      <div>
                        <p className="font-medium text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <button
                        onClick={async () => {
                          const val = !settings[key as keyof typeof settings];
                          setSettings((s) => ({ ...s, [key]: val }));
                          await apiClient.updateUserSettings({ [key]: val }).catch(() => {});
                        }}
                        className={`w-10 h-6 rounded-full transition-colors relative ${settings[key as keyof typeof settings] ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings[key as keyof typeof settings] ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === "privacy" && (
                <div className="space-y-3">
                  {[
                    { key: "hideProfile", label: "Hide profile", desc: "Make your profile less visible to others" },
                    { key: "marketingOptIn", label: "Marketing emails", desc: "Receive promotional and product updates" },
                    { key: "shareLocation", label: "Share location data", desc: "Allow location data for matching" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between p-4 bg-secondary rounded-xl">
                      <div>
                        <p className="font-medium text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <button
                        onClick={async () => {
                          const val = !settings[key as keyof typeof settings];
                          setSettings((s) => ({ ...s, [key]: val }));
                          await apiClient.updateUserSettings({ [key]: val }).catch(() => {});
                        }}
                        className={`w-10 h-6 rounded-full transition-colors relative ${settings[key as keyof typeof settings] ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings[key as keyof typeof settings] ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
