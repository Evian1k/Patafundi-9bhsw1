import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiClient } from "@/lib/api";
import { bootstrapAuthSessionFromUser } from "@/lib/authSession";
import { ArrowLeft, ArrowRight, Upload, CheckCircle, AlertCircle, Loader, X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import LocationPicker, { type LocationSelection } from "@/components/maps/LocationPicker";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";

const SKILLS = ["Plumbing", "Electrical", "AC & HVAC", "Cleaning", "Carpentry", "Auto Repair", "Painting", "Masonry", "Welding", "Roofing"];

export default function FundiRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [locationSelection, setLocationSelection] = useState<LocationSelection | null>(null);

  const [data, setData] = useState({
    fullName: "", email: "", phone: "", password: "", mpesaNumber: "",
    county: "", town: "", idNumber: "",
    idPhoto: null as File | null, idPhotoPreview: "",
    idPhotoBack: null as File | null, idPhotoBackPreview: "",
    selfiePhoto: null as File | null, selfiePhotoPreview: "",
    latitude: null as number | null, longitude: null as number | null,
    skills: [] as string[], experience: "",
  });

  const onLocationChange = (selection: LocationSelection | null) => {
    setLocationSelection(selection);
    if (!selection?.formattedAddress || selection.latitude == null || selection.longitude == null) {
      setData((d) => ({ ...d, latitude: null, longitude: null, county: "", town: "" }));
      return;
    }
    setData((d) => ({
      ...d,
      latitude: selection.latitude,
      longitude: selection.longitude,
      county: selection.address?.county || selection.address?.town || "",
      town: selection.address?.town || selection.address?.estate || selection.address?.street || "",
    }));
  };

  const handleSubmitRegistration = async () => {
    if (!data.fullName || !data.email || !data.password || !data.phone) {
      toast.error("Complete all account fields"); return;
    }
    if (!data.idPhoto || !data.selfiePhoto) {
      toast.error("ID front and selfie are required"); return;
    }
    if (!data.latitude || !data.skills.length) {
      toast.error("Location and at least one skill are required"); return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("fullName", data.fullName);
      fd.append("email", data.email);
      fd.append("phone", data.phone);
      fd.append("password", data.password);
      fd.append("mpesaNumber", data.mpesaNumber || data.phone);
      fd.append("county", data.county);
      fd.append("town", data.town);
      fd.append("idNumber", data.idNumber);
      fd.append("skills", JSON.stringify(data.skills));
      fd.append("experience", data.experience);
      fd.append("latitude", String(data.latitude));
      fd.append("longitude", String(data.longitude));
      fd.append("idPhoto", data.idPhoto);
      if (data.idPhotoBack) fd.append("idPhotoBack", data.idPhotoBack);
      fd.append("selfiePhoto", data.selfiePhoto, "selfie.jpg");

      const res = await apiClient.registerFundiAccount(fd);
      setPendingEmail(res.email);
      if (res.devOtp) toast.info(`Dev OTP: ${res.devOtp}`);
      toast.success("Account created. Verify your email.");
      setStep(5);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!pendingEmail || otpCode.length < 6) { toast.error("Enter the 6-digit code"); return; }
    setLoading(true);
    try {
      const res = await apiClient.otpVerify(pendingEmail, otpCode, "register") as { user?: Record<string, unknown>; token?: string };
      if (res.token) apiClient.setToken(res.token);
      bootstrapAuthSessionFromUser(res.user);
      toast.success("Email verified! Your application is under review.");
      navigate("/fundi/pending");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const steps = ["Account", "Location & Skills", "Verification Docs", "Review", "Verify Email"];

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)} className="p-2 hover:bg-muted rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-sm">Register as Fundi</h1>
            <p className="text-xs text-muted-foreground">No existing account required</p>
            <div className="flex gap-1 mt-1">
              {steps.map((_, i) => <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-muted"}`} />)}
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{step}/{steps.length}</span>
        </div>

        <div className="bg-card rounded-2xl p-6 border border-border/50">
          <h2 className="font-display font-bold text-xl mb-1">{steps[step - 1]}</h2>

          {step === 1 && (
            <div className="space-y-4 mt-4">
              <div><label className="text-xs font-medium">Full Name *</label><input value={data.fullName} onChange={e => setData(d => ({...d, fullName: e.target.value}))} className="w-full mt-1 px-3 py-2 border rounded-xl text-sm" /></div>
              <div><label className="text-xs font-medium">Email *</label><input type="email" value={data.email} onChange={e => setData(d => ({...d, email: e.target.value}))} className="w-full mt-1 px-3 py-2 border rounded-xl text-sm" /></div>
              <div><label className="text-xs font-medium">Phone *</label><input value={data.phone} onChange={e => setData(d => ({...d, phone: e.target.value}))} placeholder="+254..." className="w-full mt-1 px-3 py-2 border rounded-xl text-sm" /></div>
              <div><label className="text-xs font-medium">M-Pesa Number *</label><input value={data.mpesaNumber} onChange={e => setData(d => ({...d, mpesaNumber: e.target.value}))} placeholder="+254..." className="w-full mt-1 px-3 py-2 border rounded-xl text-sm" /></div>
              <div className="relative">
                <label className="text-xs font-medium">Password *</label>
                <input type={showPassword ? "text" : "password"} value={data.password} onChange={e => setData(d => ({...d, password: e.target.value}))} className="w-full mt-1 px-3 py-2 border rounded-xl text-sm pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 text-muted-foreground">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
              <p className="text-xs text-muted-foreground">Already have an account? <Link to="/auth" className="text-primary underline">Sign in</Link></p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium">County</label><input value={data.county} onChange={e => setData(d => ({...d, county: e.target.value}))} className="w-full mt-1 px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="text-xs font-medium">Town</label><input value={data.town} onChange={e => setData(d => ({...d, town: e.target.value}))} className="w-full mt-1 px-3 py-2 border rounded-xl text-sm" /></div>
              </div>
              <LocationPicker value={locationSelection} onChange={onLocationChange} placeholder="Pin your service area" />
              <div>
                <label className="text-xs font-medium block mb-2">Skills *</label>
                <div className="flex flex-wrap gap-2">
                  {SKILLS.map(skill => (
                    <button key={skill} type="button" onClick={() => setData(d => ({ ...d, skills: d.skills.includes(skill) ? d.skills.filter(s => s !== skill) : [...d.skills, skill] }))} className={`px-3 py-1.5 rounded-full text-xs border ${data.skills.includes(skill) ? "bg-primary text-white border-primary" : "border-border"}`}>{skill}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Experience *</label>
                <select value={data.experience} onChange={e => setData(d => ({...d, experience: e.target.value}))} className="w-full mt-1 px-3 py-2 border rounded-xl text-sm">
                  <option value="">Select</option>
                  {["less than 1 year", "1-2 years", "3-5 years", "5-10 years", "10+ years"].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 mt-4">
              <div><label className="text-xs font-medium">National ID Number</label><input value={data.idNumber} onChange={e => setData(d => ({...d, idNumber: e.target.value}))} className="w-full mt-1 px-3 py-2 border rounded-xl text-sm" /></div>
              {[
                { key: "idPhoto" as const, preview: "idPhotoPreview" as const, label: "ID Front *" },
                { key: "idPhotoBack" as const, preview: "idPhotoBackPreview" as const, label: "ID Back" },
                { key: "selfiePhoto" as const, preview: "selfiePhotoPreview" as const, label: "Selfie *" },
              ].map(({ key, preview, label }) => (
                <div key={key}>
                  <label className="text-xs font-medium block mb-2">{label}</label>
                  {data[preview] ? (
                    <div className="relative"><img src={data[preview]} alt={label} className="w-full h-36 object-cover rounded-xl" /><button type="button" onClick={() => setData(d => ({ ...d, [key]: null, [preview]: "" }))} className="absolute top-2 right-2 bg-black/50 rounded-full p-1"><X className="w-3 h-3 text-white" /></button></div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-36 border-2 border-dashed rounded-xl cursor-pointer">
                      <Upload className="w-6 h-6 text-muted-foreground mb-2" /><span className="text-xs text-muted-foreground">Upload {label}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setData(d => ({ ...d, [key]: f, [preview]: URL.createObjectURL(f) })); }} />
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 mt-4 text-sm">
              {[["Name", data.fullName], ["Email", data.email], ["Phone", data.phone], ["County", data.county], ["Town", data.town], ["Skills", data.skills.join(", ")]].map(([k, v]) => (
                <div key={k as string} className="flex justify-between border-b py-2"><span className="text-muted-foreground">{k as string}</span><span className="font-medium text-right max-w-[60%]">{v as string || "—"}</span></div>
              ))}
              <div className="p-3 bg-yellow-50 rounded-xl flex gap-2 text-xs text-yellow-800"><AlertCircle className="w-4 h-4 shrink-0" />After email verification, an admin will review your documents before you can go online.</div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4 mt-4 text-center">
              <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to <strong>{pendingEmail}</strong></p>
              <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}><InputOTPGroup>{[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup></InputOTP>
              <Button className="w-full bg-gradient-primary" onClick={verifyOtp} disabled={loading || otpCode.length < 6}>{loading ? <Loader className="w-4 h-4 animate-spin" /> : "Verify & Continue"}</Button>
            </div>
          )}
        </div>

        {step < 5 && (
          <div className="mt-4 flex gap-3">
            {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>}
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)} className="flex-1 bg-gradient-primary">Continue<ArrowRight className="w-4 h-4 ml-2" /></Button>
            ) : (
              <Button onClick={handleSubmitRegistration} disabled={loading} className="flex-1 bg-gradient-primary">
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4 mr-2" />Create Fundi Account</>}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
