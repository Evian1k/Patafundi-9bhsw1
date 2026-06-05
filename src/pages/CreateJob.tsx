import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Camera,
  Wrench,
  Zap,
  Droplets,
  Wind,
  Hammer,
  Sparkles,
  Car,
  PaintBucket,
  CheckCircle,
  X,
  Loader,
  Navigation2,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

interface LocationSearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface PhotoData {
  file: File;
  preview: string;
}

interface JobFormData {
  service: string;
  problem: string;
  description: string;
  urgency: string;
  location: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  photos: PhotoData[];
}

const services = [
  { id: "plumbing", name: "Plumbing", icon: Droplets, color: "from-blue-500 to-cyan-500" },
  { id: "electrical", name: "Electrical", icon: Zap, color: "from-yellow-500 to-orange-500" },
  { id: "hvac", name: "AC & HVAC", icon: Wind, color: "from-sky-500 to-blue-500" },
  { id: "cleaning", name: "Cleaning", icon: Sparkles, color: "from-emerald-500 to-teal-500" },
  { id: "carpentry", name: "Carpentry", icon: Hammer, color: "from-amber-500 to-yellow-600" },
  { id: "auto", name: "Auto Repair", icon: Car, color: "from-red-500 to-rose-500" },
  { id: "painting", name: "Painting", icon: PaintBucket, color: "from-purple-500 to-pink-500" },
  { id: "general", name: "General Repair", icon: Wrench, color: "from-gray-500 to-slate-500" },
];

const urgencyOptions = [
  { id: "asap", label: "ASAP", description: "Within 2 hours", price: "+20%" },
  { id: "today", label: "Today", description: "Within 6 hours", price: "+10%" },
  { id: "scheduled", label: "Schedule", description: "Pick a date & time", price: "Standard" },
];

const CreateJob = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [jobData, setJobData] = useState<JobFormData>({
    service: searchParams.get("service") || "",
    problem: searchParams.get("problem") || "",
    description: "",
    urgency: "",
    location: "",
    latitude: undefined,
    longitude: undefined,
    locationName: "",
    scheduledDate: "",
    scheduledTime: "",
    photos: [],
  });

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      navigate("/auth");
      return;
    }
    apiClient.getCurrentUser().catch(() => navigate("/auth"));
  }, [navigate]);

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const data = await apiClient.reverseGeocode(lat, lng) as { areaName?: string; formattedAddress?: string | null };
      return data.formattedAddress || data.areaName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  };

  const searchLocation = async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const data = await apiClient.searchLocations(query) as { results?: LocationSearchResult[] };
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const selectLocation = (result: LocationSearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    // Show area name, not raw coordinates
    const displayName = result.display_name.split(",").slice(0, 3).join(",").trim();
    setJobData((prev) => ({ ...prev, latitude: lat, longitude: lng, location: displayName, locationName: displayName }));
    setSearchQuery(displayName);
    setSearchResults([]);
  };

  const captureLocation = async () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setGeoLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
      );
      const { latitude, longitude } = position.coords;
      const locationName = await reverseGeocode(latitude, longitude);
      setJobData((prev) => ({ ...prev, latitude, longitude, location: locationName, locationName }));
      setSearchQuery(locationName);
      toast.success("Location captured");
    } catch {
      toast.error("Failed to get location. Please search manually.");
    } finally {
      setGeoLoading(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newPhotos = files.map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setJobData((prev) => ({ ...prev, photos: [...prev.photos, ...newPhotos].slice(0, 5) }));
  };

  const removePhoto = (idx: number) => {
    setJobData((prev) => {
      const photos = [...prev.photos];
      URL.revokeObjectURL(photos[idx].preview);
      photos.splice(idx, 1);
      return { ...prev, photos };
    });
  };

  const canProceed = () => {
    if (step === 1) return !!jobData.service;
    if (step === 2) return jobData.description.trim().length >= 10;
    if (step === 3) return !!jobData.urgency && !!jobData.location && jobData.latitude !== undefined;
    return true;
  };

  const handleSubmit = async () => {
    if (!jobData.latitude || !jobData.longitude) {
      toast.error("Please select or capture your location before submitting.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        title: `${jobData.service} - ${jobData.problem || jobData.description.slice(0, 40)}`,
        description: jobData.description,
        category: jobData.service,
        location: jobData.location,
        latitude: jobData.latitude,
        longitude: jobData.longitude,
        urgency: jobData.urgency,
        scheduledDate: jobData.urgency === "scheduled" ? jobData.scheduledDate : undefined,
        scheduledTime: jobData.urgency === "scheduled" ? jobData.scheduledTime : undefined,
      };

      const res = await apiClient.createJob(payload) as { job?: { id: string } };

      if (res?.job?.id && jobData.photos.length > 0) {
        for (const photo of jobData.photos) {
          try {
            const fd = new FormData();
            fd.append("photo", photo.file);
            await apiClient.uploadJobPhoto(res.job.id, fd);
          } catch { /* non-fatal */ }
        }
      }

      toast.success("Job created! Finding fundis near you...");
      navigate(`/job/${res?.job?.id}/tracking`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-sm">Create Job Request</h1>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{step}/4</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {/* Step 1: Service Selection */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-xl font-display font-bold mb-2">What service do you need?</h2>
              <p className="text-muted-foreground text-sm mb-6">Select the category that best matches your needs.</p>
              <div className="grid grid-cols-2 gap-3">
                {services.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => setJobData((prev) => ({ ...prev, service: service.name }))}
                    className={`p-4 rounded-2xl border-2 transition-all text-left ${
                      jobData.service === service.name
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-3`}>
                      <service.icon className="w-5 h-5 text-white" />
                    </div>
                    <p className="font-medium text-sm">{service.name}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: Description */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-xl font-display font-bold mb-2">Describe the problem</h2>
              <p className="text-muted-foreground text-sm mb-6">Be as specific as possible to get accurate quotes.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Problem description *</label>
                  <textarea
                    value={jobData.description}
                    onChange={(e) => setJobData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="e.g., My kitchen sink has been leaking for 2 days, water dripping from the pipe under the sink..."
                    rows={5}
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{jobData.description.length}/500 characters (min 10)</p>
                </div>

                {/* Photos */}
                <div>
                  <label className="block text-sm font-medium mb-2">Add photos (optional, max 5)</label>
                  <div className="flex flex-wrap gap-2">
                    {jobData.photos.map((photo, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden">
                        <img src={photo.preview} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removePhoto(idx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                    {jobData.photos.length < 5 && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary transition-colors"
                      >
                        <Camera className="w-5 h-5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Add</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Location & Urgency */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-xl font-display font-bold mb-2">Location & urgency</h2>
              <p className="text-muted-foreground text-sm mb-6">When and where do you need the service?</p>

              <div className="space-y-5">
                {/* Urgency */}
                <div>
                  <label className="block text-sm font-medium mb-2">How urgent is this?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {urgencyOptions.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setJobData((prev) => ({ ...prev, urgency: opt.id }))}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${
                          jobData.urgency === opt.id ? "border-primary bg-primary/5" : "border-border bg-card"
                        }`}
                      >
                        <p className="font-semibold text-sm">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.description}</p>
                        <p className="text-xs font-medium text-primary mt-1">{opt.price}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Schedule pickers */}
                {jobData.urgency === "scheduled" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Date</label>
                      <input
                        type="date"
                        value={jobData.scheduledDate}
                        onChange={(e) => setJobData((prev) => ({ ...prev, scheduledDate: e.target.value }))}
                        className="w-full px-3 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        min={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Time</label>
                      <input
                        type="time"
                        value={jobData.scheduledTime}
                        onChange={(e) => setJobData((prev) => ({ ...prev, scheduledTime: e.target.value }))}
                        className="w-full px-3 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                )}

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium mb-2">Service location *</label>
                  <div className="flex gap-2 mb-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          searchLocation(e.target.value);
                        }}
                        placeholder="Search location..."
                        className="w-full pl-9 pr-4 py-3 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 rounded-xl"
                      onClick={captureLocation}
                      disabled={geoLoading}
                      title="Use my location"
                    >
                      {geoLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Navigation2 className="w-4 h-4" />}
                    </Button>
                  </div>

                  {/* Search results */}
                  {searchResults.length > 0 && (
                    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-md">
                      {searchResults.map((r, idx) => (
                        <button
                          key={idx}
                          onClick={() => selectLocation(r)}
                          className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                        >
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <p className="text-sm">{r.display_name.split(",").slice(0, 3).join(",")}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchLoading && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Loader className="w-3 h-3 animate-spin" />
                      Searching...
                    </div>
                  )}

                  {/* Show selected location name (no coordinates) */}
                  {jobData.location && jobData.latitude && (
                    <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Location set</p>
                        <p className="text-xs text-muted-foreground">{jobData.location}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 4: Review & Submit */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-xl font-display font-bold mb-2">Review your request</h2>
              <p className="text-muted-foreground text-sm mb-6">Check the details before submitting.</p>
              <div className="space-y-4">
                <div className="bg-card rounded-2xl p-5 border border-border/50 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Wrench className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{jobData.service}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {jobData.urgency} • {urgencyOptions.find(u => u.id === jobData.urgency)?.description}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-border/50 pt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-1">DESCRIPTION</p>
                    <p className="text-sm">{jobData.description}</p>
                  </div>

                  <div className="border-t border-border/50 pt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-1">LOCATION</p>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-sm">{jobData.location}</p>
                    </div>
                  </div>

                  {jobData.photos.length > 0 && (
                    <div className="border-t border-border/50 pt-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2">PHOTOS</p>
                      <div className="flex gap-2">
                        {jobData.photos.map((p, i) => (
                          <img key={i} src={p.preview} alt="" className="w-16 h-16 rounded-xl object-cover" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="mt-8 flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1 rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex-1 bg-gradient-primary rounded-xl"
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading || !jobData.latitude}
              className="flex-1 bg-gradient-primary rounded-xl"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Submit Job Request
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateJob;
