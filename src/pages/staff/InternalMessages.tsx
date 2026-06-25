/**
 * Internal Messaging — Staff chat, announcements, department channels
 */
import { useEffect, useState, useRef } from "react";
import { apiClient } from "@/lib/api";
import { Send, Hash, AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";

export default function InternalMessages() {
  const [channels, setChannels] = useState<any[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [isEmergency, setIsEmergency] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.request("/staff/messages/channels").catch(() => ({ channels: [] }))
      .then((d: any) => {
        setChannels(d?.channels || []);
        if (d?.channels?.[0]) setActiveChannel(d.channels[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeChannel) return;
    apiClient.request(`/staff/messages/channel/${activeChannel}`).catch(() => ({ messages: [] }))
      .then((d: any) => { setMessages(d?.messages || []); })
      .finally(() => {
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      });
    const interval = setInterval(() => {
      apiClient.request(`/staff/messages/channel/${activeChannel}`).catch(() => null)
        .then((d: any) => { if (d?.messages) setMessages(d.messages); });
    }, 5000);
    return () => clearInterval(interval);
  }, [activeChannel]);

  const send = async () => {
    if (!input.trim()) return;
    try {
      await apiClient.request("/staff/messages/send", {
        method: "POST",
        body: JSON.stringify({ channelId: activeChannel, message: input.trim(), isEmergency }),
      });
      setInput("");
      setIsEmergency(false);
      // Refresh
      const d = await apiClient.request(`/staff/messages/channel/${activeChannel}`) as any;
      if (d?.messages) setMessages(d.messages);
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading messages…</div>;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Internal Messaging</h1>
      <p className="text-slate-500 text-sm mb-6">Staff communication — do not use WhatsApp for platform business</p>

      <div className="flex gap-4 h-[600px]">
        {/* Channel list */}
        <div className="w-56 shrink-0 bg-white rounded-2xl border border-slate-100 p-3 overflow-y-auto">
          {channels.map(ch => (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch.id)}
              className={`w-full text-left p-2.5 rounded-lg mb-1 flex items-center gap-2 text-sm transition-colors ${
                activeChannel === ch.id ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              {ch.type === "emergency" ? <AlertTriangle className="w-4 h-4" /> :
               ch.type === "announcement" ? <Hash className="w-4 h-4" /> :
               <Users className="w-4 h-4" />}
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-100">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <Hash className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No messages yet. Start the conversation!</p>
              </div>
            ) : messages.map(m => (
              <div key={m.id} className={`flex ${m.is_emergency ? "bg-red-50 -mx-4 px-4 py-2 rounded-lg" : ""}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-slate-900">{m.sender_name}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-slate-100 rounded capitalize text-slate-600">{m.sender_role?.replace("_", " ")}</span>
                    {m.is_emergency && <span className="text-xs px-1.5 py-0.5 bg-red-100 rounded text-red-700 font-bold">EMERGENCY</span>}
                    <span className="text-xs text-slate-400">{new Date(m.created_at).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-sm text-slate-700">{m.message}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 p-3 flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={() => setIsEmergency(!isEmergency)}
              className={`p-2 rounded-lg transition-colors ${isEmergency ? "bg-red-100 text-red-600" : "text-slate-400 hover:bg-slate-100"}`}
              title="Mark as emergency"
            >
              <AlertTriangle className="w-4 h-4" />
            </button>
            <button
              onClick={send}
              disabled={!input.trim()}
              className="p-2 bg-primary text-white rounded-lg disabled:opacity-30"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
