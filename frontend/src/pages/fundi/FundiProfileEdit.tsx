/**
 * Fundi Profile Edit — bio + skills self-service (spec §5 "manage profile").
 * Writes through PUT /fundi/profile (server scopes to the signed-in fundi).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

const SUGGESTED_SKILLS = [
  "plumbing", "electrical", "carpentry", "cleaning", "painting",
  "hvac", "roofing", "welding", "appliance_repair", "masonry", "gardening",
];

export default function FundiProfileEdit() {
  const navigate = useNavigate();
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getFundiProfile() as { fundi?: { bio?: string; skills?: string[] | string } };
        const f = res?.fundi;
        setBio(f?.bio || "");
        const raw = f?.skills;
        if (Array.isArray(raw)) setSkills(raw);
        else if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw);
            setSkills(Array.isArray(parsed) ? parsed : raw.split(",").map((s) => s.trim()).filter(Boolean));
          } catch {
            setSkills(raw.split(",").map((s) => s.trim()).filter(Boolean));
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load your profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleSkill = (skill: string) => {
    setSkills((list) => (list.includes(skill) ? list.filter((s) => s !== skill) : [...list, skill]));
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.updateFundiProfile({ bio: bio.trim() || null, skills });
      toast.success("Profile updated");
      navigate("/fundi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate("/fundi")} className="p-2 hover:bg-muted rounded-xl" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-display font-bold">Edit Profile</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="bg-card rounded-2xl p-5 border border-border/50 space-y-2">
              <label className="text-sm font-medium">About you</label>
              <p className="text-xs text-muted-foreground">Tell customers what you do best and your experience.</p>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                maxLength={600}
                placeholder="e.g. Certified plumber with 6 years of experience in residential repairs and installations."
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
              <p className="text-[11px] text-muted-foreground text-right">{bio.length}/600</p>
            </div>

            <div className="bg-card rounded-2xl p-5 border border-border/50 space-y-3">
              <div>
                <label className="text-sm font-medium">Your skills</label>
                <p className="text-xs text-muted-foreground">Pick every category you can handle - this drives your job matches.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_SKILLS.map((skill) => {
                  const active = skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary/50"
                      }`}
                    >
                      {skill.replace("_", " ")}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button onClick={save} disabled={saving} className="w-full bg-gradient-primary h-12 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save profile
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
