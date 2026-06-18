import { useState } from "react";
import { motion } from "framer-motion";
import { X, Check, AlertTriangle, MapPin, Shield, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { sanitizeLocationText, LOCATION_FALLBACK } from "@/lib/maps/geocoding";

interface FundiVerificationModalProps {
  fundi: Record<string, unknown>;
  onClose: () => void;
}

function scoreColor(score: number | null | undefined, invert = false) {
  if (score == null) return "text-gray-500";
  const v = invert ? 100 - score : score;
  if (v >= 90) return "text-green-600";
  if (v >= 75) return "text-yellow-600";
  return "text-red-600";
}

function statusLabel(result: string | undefined) {
  const map: Record<string, string> = {
    strong_match: "Strong Match",
    review_required: "Review Required",
    suspicious: "Suspicious",
    auto_approved: "Auto-Approved",
    pending: "Pending",
    reupload_requested: "Re-upload Requested",
  };
  return map[result || ""] || result || "Pending";
}

export default function FundiVerificationModal({ fundi, onClose }: FundiVerificationModalProps) {
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | "reupload" | null>(null);
  const [reason, setReason] = useState("");
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const faceMatch = fundi.faceMatchScore as number | null;
  const liveness = fundi.livenessScore as number | null;
  const fraudRisk = fundi.fraudRiskScore as number | null;
  const verificationResult = (fundi.verificationResult || fundi.identityVerificationStatus) as string;

  const handleAction = async () => {
    if (!action) return;
    if (action !== "approve" && !reason) { toast.error("Please provide a reason"); return; }
    setLoading(true);
    try {
      if (action === "reupload") {
        await apiClient.requestFundiReupload(String(fundi.id), reason);
      } else {
        await apiClient.request(`/admin/fundis/${fundi.id}/${action}`, {
          method: "POST",
          includeAuth: true,
          body: action === "approve" ? { notes: reason || null } : { reason },
        });
      }
      toast.success(`Fundi ${action === "reupload" ? "re-upload requested" : action + "d"} successfully!`);
      onClose();
    } catch (error: unknown) {
      toast.error((error as Error).message || `Failed to ${action} fundi`);
    } finally {
      setLoading(false);
    }
  };

  const isOCRMatch = (fundi.ocrComparison as Record<string, unknown>)?.idNumberMatch;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-xl">{fundi.firstName as string} {fundi.lastName as string}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <Shield className="w-3.5 h-3.5" />
              {statusLabel(verificationResult)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-gray-50 rounded-xl text-center">
              <p className="text-xs text-gray-500 mb-1">Face Match</p>
              <p className={`text-2xl font-bold ${scoreColor(faceMatch)}`}>{faceMatch != null ? `${faceMatch}%` : "—"}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl text-center">
              <p className="text-xs text-gray-500 mb-1">Liveness</p>
              <p className={`text-2xl font-bold ${scoreColor(liveness)}`}>{liveness != null ? `${liveness}%` : "—"}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl text-center">
              <p className="text-xs text-gray-500 mb-1">Fraud Risk</p>
              <p className={`text-2xl font-bold ${scoreColor(fraudRisk, true)}`}>{fraudRisk != null ? `${fraudRisk}%` : "—"}</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Personal Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Email", fundi.email], ["Phone", fundi.phone], ["ID Number", fundi.idNumber], ["Experience", `${fundi.experienceYears} years`],
              ].map(([label, value]) => (
                <div key={label as string} className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 mb-0.5">{label as string}</p>
                  <p className="font-medium">{(value as string) || "—"}</p>
                </div>
              ))}
            </div>
          </div>

          {fundi.ocrComparison && (
            <div className={`p-4 rounded-xl border ${isOCRMatch ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
              <div className="flex items-center gap-2 mb-2">
                {isOCRMatch ? <Check className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-yellow-600" />}
                <span className="font-semibold text-sm">{isOCRMatch ? "ID Number Match ✓" : "ID Number Mismatch ⚠"}</span>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-3">Verification Documents (Admin Only)</h3>
            <div className="grid grid-cols-3 gap-3">
              {(fundi.idPhotoUrl as string) && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">ID Front</p>
                  <img src={fundi.idPhotoUrl as string} alt="ID front" className="w-full h-28 object-cover rounded-xl cursor-pointer hover:opacity-90 border" onClick={() => setZoomedImage(fundi.idPhotoUrl as string)} />
                </div>
              )}
              {(fundi.idPhotoBackUrl as string) && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">ID Back</p>
                  <img src={fundi.idPhotoBackUrl as string} alt="ID back" className="w-full h-28 object-cover rounded-xl cursor-pointer hover:opacity-90 border" onClick={() => setZoomedImage(fundi.idPhotoBackUrl as string)} />
                </div>
              )}
              {(fundi.selfieUrl as string) && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Selfie</p>
                  <img src={fundi.selfieUrl as string} alt="Selfie" className="w-full h-28 object-cover rounded-xl cursor-pointer hover:opacity-90 border" onClick={() => setZoomedImage(fundi.selfieUrl as string)} />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">All document views are logged in audit_logs.</p>
          </div>

          {(fundi.locationAddress || fundi.locationCity) && (
            <div>
              <h3 className="font-semibold mb-2">Location</h3>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4 text-primary" />
                <span>{sanitizeLocationText(String(fundi.locationAddress || fundi.locationCity || ''), LOCATION_FALLBACK)}</span>
              </div>
            </div>
          )}

          {Array.isArray(fundi.skills) && (fundi.skills as string[]).length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {(fundi.skills as string[]).map((s) => <span key={s} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">{s}</span>)}
              </div>
            </div>
          )}

          {fundi.verificationStatus === "pending" && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Admin Action</h3>
              {!action ? (
                <div className="flex flex-wrap gap-3">
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => setAction("approve")}>Approve</Button>
                  <Button className="bg-red-600 hover:bg-red-700" onClick={() => setAction("reject")}>Reject</Button>
                  <Button variant="outline" onClick={() => setAction("reupload")}><RefreshCw className="w-4 h-4 mr-2" />Request Re-upload</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {action !== "approve" && (
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {action === "reject" ? "Rejection" : "Re-upload"} Reason *
                      </label>
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                  )}
                  {action === "approve" && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Add any notes..." />
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button onClick={handleAction} disabled={loading || (action !== "approve" && !reason)} className="flex-1">
                      {loading ? "Processing..." : `Confirm ${action === "reupload" ? "re-upload request" : action}`}
                    </Button>
                    <Button variant="outline" onClick={() => setAction(null)} className="flex-1">Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {fundi.verificationStatus !== "pending" && (
            <div className="p-3 bg-muted rounded-xl text-sm text-muted-foreground">
              This fundi has already been {fundi.verificationStatus as string}. No further actions available.
            </div>
          )}
        </div>
      </motion.div>

      {zoomedImage && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4" onClick={() => setZoomedImage(null)}>
          <div className="relative max-w-2xl w-full">
            <button onClick={() => setZoomedImage(null)} className="absolute -top-10 right-0 text-white p-2 hover:bg-white/20 rounded-full"><X className="w-5 h-5" /></button>
            <img src={zoomedImage} alt="Zoomed" className="w-full rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </div>
  );
}
