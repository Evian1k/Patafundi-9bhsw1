import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { apiClient } from "@/lib/api";
import { ArrowLeft, ArrowRight, Camera, Upload, CheckCircle, AlertCircle, MapPin, Loader, X, Shield, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SKILLS = ["Plumbing", "Electrical", "AC & HVAC", "Cleaning", "Carpentry", "Auto Repair", "Painting", "Masonry", "Welding", "Roofing"];

export default function FundiRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [streamRef, setStreamRef] = useState<MediaStream | null>(null);

  const [data, setData] = useState({
    firstName: "", lastName: "", email: "", phone: "", password: "",
    idNumber: "", idPhoto: null as File | null, idPhotoPreview: "",
    idPhotoBack: null as File | null, idPhotoBackPreview: "",
    selfiePhoto: null as Blob | null, selfiePhotoPreview: "",
    latitude: null as number | null, longitude: null as number | null,
    accuracy: null as number | null,
    locationDisplayName: "", locationArea: "", locationCity: "",
    skills: [] as string[], experience: "", mpesaNumber: "",
  });

  useEffect(() => {
    return () => { if (streamRef) streamRef.getTracks().forEach(t => t.stop()); };
  }, [streamRef]);

  const captureLocation = async () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setGeoLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 })
      );
      const { latitude, longitude, accuracy } = pos.coords;
      // Reverse geocode
      let locationDisplayName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      let locationCity = "";
      let locationArea = "";
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=en`);
        const geoData = await res.json();
        const addr = geoData.address || {};
        locationCity = addr.city || addr.town || addr.village || "";
        locationArea = addr.suburb || addr.neighbourhood || addr.county || "";
        const parts = [addr.road, locationArea, locationCity].filter(Boolean);
        locationDisplayName = parts.length > 0 ? parts.join(", ") : locationDisplayName;
      } catch { /* ignore */ }
      setData(d => ({ ...d, latitude, longitude, accuracy: Math.round(accuracy), locationDisplayName, locationCity, locationArea }));
      toast.success("Location captured");
    } catch (e) {
      toast.error("Failed to get location: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setGeoLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setStreamRef(stream);
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setCameraActive(true);
    } catch { toast.error("Camera access denied"); }
  };

  const takeSelfie = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx?.drawImage(videoRef.current, 0, 0);
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setData(d => ({ ...d, selfiePhoto: blob, selfiePhotoPreview: url }));
        setCameraActive(false);
        if (streamRef) { streamRef.getTracks().forEach(t => t.stop()); setStreamRef(null); }
      }
    }, "image/jpeg", 0.9);
  };

  const handleSubmit = async () => {
    if (!data.latitude || !data.longitude) { toast.error("Location is required"); return; }
    if (!data.selfiePhoto) { toast.error("Selfie is required"); return; }
    if (!data.idPhoto) { toast.error("ID photo is required"); return; }
    if (data.skills.length === 0) { toast.error("Select at least one skill"); return; }

    setLoading(true);
    try {
      // Check if already logged in as a user
      const token = localStorage.getItem("auth_token");
      if (!token) {
        // Need to register first
        toast.error("Please sign up first, then register as a fundi");
        navigate("/auth?mode=signup");
        return;
      }

      const fd = new FormData();
      fd.append("firstName", data.firstName);
      fd.append("lastName", data.lastName);
      fd.append("email", data.email);
      fd.append("phone", data.phone);
      fd.append("idNumber", data.idNumber);
      fd.append("skills", JSON.stringify(data.skills));
      fd.append("experience", data.experience);
      fd.append("mpesaNumber", data.mpesaNumber);
      fd.append("latitude", String(data.latitude));
      fd.append("longitude", String(data.longitude));
      fd.append("accuracy", String(data.accuracy || 0));
      fd.append("locationDisplayName", data.locationDisplayName);
      fd.append("locationCity", data.locationCity);
      fd.append("locationArea", data.locationArea);
      if (data.idPhoto) fd.append("idPhoto", data.idPhoto);
      if (data.idPhotoBack) fd.append("idPhotoBack", data.idPhotoBack);
      if (data.selfiePhoto) fd.append("selfiePhoto", data.selfiePhoto, "selfie.jpg");

      await apiClient.submitFundiRegistration(fd);
      toast.success("Registration submitted! Awaiting admin review.");
      navigate("/fundi/pending");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const steps = ["Personal Info", "ID Verification", "Selfie", "Location & Skills", "Review"];

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-sm">Fundi Registration</h1>
            <div className="flex gap-1 mt-1">
              {steps.map((_, i) => <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < step ? "bg-primary" : "bg-muted"}`} />)}
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{step}/{steps.length}</span>
        </div>

        <div className="bg-card rounded-2xl p-6 border border-border/50">
          <h2 className="font-display font-bold text-xl mb-1">{steps[step - 1]}</h2>

          {/* Step 1: Personal Info */}
          {step === 1 && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium">First Name *</label><input value={data.firstName} onChange={e => setData(d => ({...d, firstName: e.target.value}))} className="w-full mt-1 px-3 py-2 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
                <div><label className="text-xs font-medium">Last Name *</label><input value={data.lastName} onChange={e => setData(d => ({...d, lastName: e.target.value}))} className="w-full mt-1 px-3 py-2 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
              </div>
              <div><label className="text-xs font-medium">Email *</label><input type="email" value={data.email} onChange={e => setData(d => ({...d, email: e.target.value}))} className="w-full mt-1 px-3 py-2 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
              <div><label className="text-xs font-medium">Phone *</label><input type="tel" value={data.phone} placeholder="+254..." onChange={e => setData(d => ({...d, phone: e.target.value}))} className="w-full mt-1 px-3 py-2 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
              <div><label className="text-xs font-medium">M-Pesa Number *</label><input type="tel" value={data.mpesaNumber} placeholder="+254..." onChange={e => setData(d => ({...d, mpesaNumber: e.target.value}))} className="w-full mt-1 px-3 py-2 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
            </div>
          )}

          {/* Step 2: ID Verification */}
          {step === 2 && (
            <div className="space-y-4 mt-4">
              <div><label className="text-xs font-medium">National ID Number *</label><input value={data.idNumber} onChange={e => setData(d => ({...d, idNumber: e.target.value}))} className="w-full mt-1 px-3 py-2 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="e.g. 12345678" /></div>
              <div>
                <label className="text-xs font-medium block mb-2">ID Photo (Front) *</label>
                {data.idPhotoPreview ? (
                  <div className="relative"><img src={data.idPhotoPreview} alt="ID front" className="w-full h-40 object-cover rounded-xl" /><button onClick={() => setData(d => ({...d, idPhoto: null, idPhotoPreview: ""}))} className="absolute top-2 right-2 bg-black/50 rounded-full p-1"><X className="w-3 h-3 text-white" /></button></div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary transition-colors">
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Upload ID front</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setData(d => ({...d, idPhoto: f, idPhotoPreview: URL.createObjectURL(f)})); }} />
                  </label>
                )}
              </div>
              <div>
                <label className="text-xs font-medium block mb-2">ID Photo (Back)</label>
                {data.idPhotoBackPreview ? (
                  <div className="relative"><img src={data.idPhotoBackPreview} alt="ID back" className="w-full h-40 object-cover rounded-xl" /><button onClick={() => setData(d => ({...d, idPhotoBack: null, idPhotoBackPreview: ""}))} className="absolute top-2 right-2 bg-black/50 rounded-full p-1"><X className="w-3 h-3 text-white" /></button></div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary transition-colors">
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Upload ID back (optional)</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setData(d => ({...d, idPhotoBack: f, idPhotoBackPreview: URL.createObjectURL(f)})); }} />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Selfie */}
          {step === 3 && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
                <Shield className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-xs text-blue-700">Take a live selfie to verify your identity matches your ID.</p>
              </div>
              {data.selfiePhotoPreview ? (
                <div className="relative">
                  <img src={data.selfiePhotoPreview} alt="Selfie" className="w-full h-64 object-cover rounded-xl" />
                  <button onClick={() => setData(d => ({...d, selfiePhoto: null, selfiePhotoPreview: ""}))} className="absolute top-2 right-2 bg-black/50 rounded-full p-1"><X className="w-3 h-3 text-white" /></button>
                </div>
              ) : cameraActive ? (
                <div className="space-y-3">
                  <video ref={videoRef} className="w-full h-64 object-cover rounded-xl bg-black" autoPlay playsInline muted />
                  <canvas ref={canvasRef} className="hidden" />
                  <Button className="w-full bg-gradient-primary" onClick={takeSelfie}><Camera className="w-4 h-4 mr-2" />Take Selfie</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-border rounded-xl">
                    <Camera className="w-12 h-12 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">Take a live selfie for verification</p>
                    <Button onClick={startCamera} variant="outline"><Camera className="w-4 h-4 mr-2" />Open Camera</Button>
                  </div>
                  <div className="text-center text-xs text-muted-foreground">— or upload a photo —</div>
                  <label className="flex items-center justify-center gap-2 py-3 border border-border rounded-xl cursor-pointer hover:bg-muted transition-colors">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">Upload selfie</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setData(d => ({...d, selfiePhoto: f, selfiePhotoPreview: URL.createObjectURL(f)})); }} />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Location & Skills */}
          {step === 4 && (
            <div className="space-y-5 mt-4">
              <div>
                <label className="text-xs font-medium block mb-2">Your Location *</label>
                <Button variant="outline" className="w-full" onClick={captureLocation} disabled={geoLoading}>
                  {geoLoading ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                  {data.locationDisplayName || "Capture My Location"}
                </Button>
                {data.locationDisplayName && (
                  <div className="mt-2 p-3 bg-primary/5 rounded-xl">
                    <p className="text-xs text-muted-foreground">Location set (area name shown to customers — no coordinates shared)</p>
                    <p className="text-sm font-medium">{data.locationDisplayName}</p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium block mb-2">Skills * (select all that apply)</label>
                <div className="flex flex-wrap gap-2">
                  {SKILLS.map(skill => (
                    <button key={skill} onClick={() => setData(d => ({ ...d, skills: d.skills.includes(skill) ? d.skills.filter(s => s !== skill) : [...d.skills, skill] }))} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${data.skills.includes(skill) ? "bg-primary text-white border-primary" : "bg-card border-border hover:border-primary"}`}>
                      {skill}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-2">Years of Experience *</label>
                <select value={data.experience} onChange={e => setData(d => ({...d, experience: e.target.value}))} className="w-full px-3 py-2 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Select experience</option>
                  {["less than 1 year", "1-2 years", "3-5 years", "5-10 years", "10+ years"].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className="space-y-4 mt-4">
              {[
                { label: "Name", value: `${data.firstName} ${data.lastName}` },
                { label: "Email", value: data.email },
                { label: "Phone", value: data.phone },
                { label: "ID Number", value: data.idNumber },
                { label: "Skills", value: data.skills.join(", ") },
                { label: "Experience", value: data.experience },
                { label: "Location", value: data.locationDisplayName },
                { label: "M-Pesa", value: data.mpesaNumber },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-xs font-medium text-right max-w-[60%]">{value || "—"}</span>
                </div>
              ))}
              <div className="p-3 bg-yellow-50 rounded-xl flex gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-700">Submitting false information will result in permanent ban. All data is verified by our admin team.</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-4 flex gap-3">
          {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1 rounded-xl"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>}
          {step < 5 ? (
            <Button onClick={() => setStep(step + 1)} className="flex-1 bg-gradient-primary rounded-xl">Continue<ArrowRight className="w-4 h-4 ml-2" /></Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} className="flex-1 bg-gradient-primary rounded-xl">
              {loading ? <><Loader className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : <><CheckCircle className="w-4 h-4 mr-2" />Submit Registration</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
