import { useState, useEffect, useCallback } from "react";
import { Newspaper, Briefcase, Loader2, RefreshCw, Plus, Trash2, Eye, EyeOff, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  author: string | null;
  status: string;
  published_at: string | null;
  body?: string;
}

interface CareerJob {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  type: string | null;
  status: string;
  description?: string | null;
  requirements?: string | null;
}

type Tab = "blog" | "careers";

/**
 * Content manager (spec §46-47): admins write blog posts and manage open
 * career roles. Everything published here appears on the public /blog and
 * /careers pages; nothing is seed-only anymore.
 */
export default function AdminContent() {
  const [tab, setTab] = useState<Tab>("blog");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [jobs, setJobs] = useState<CareerJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Blog editor state
  const [blogDialog, setBlogDialog] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [blogForm, setBlogForm] = useState({ title: "", excerpt: "", body: "", author: "PataFundi Team" });
  const [blogSaving, setBlogSaving] = useState(false);

  // Career editor state
  const [jobDialog, setJobDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<CareerJob | null>(null);
  const [jobForm, setJobForm] = useState({ title: "", department: "", location: "Nairobi, Kenya", type: "Full-time", description: "", requirements: "" });
  const [jobSaving, setJobSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [postRes, jobRes] = await Promise.allSettled([
        apiClient.adminListBlogPosts() as Promise<{ posts?: BlogPost[] }>,
        apiClient.adminListCareerJobs() as Promise<{ jobs?: CareerJob[] }>,
      ]);
      if (postRes.status === "fulfilled") setPosts(postRes.value.posts || []);
      if (jobRes.status === "fulfilled") setJobs(jobRes.value.jobs || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNewPost = () => {
    setEditingPost(null);
    setBlogForm({ title: "", excerpt: "", body: "", author: "PataFundi Team" });
    setBlogDialog(true);
  };

  const openEditPost = (post: BlogPost) => {
    setEditingPost(post);
    setBlogForm({ title: post.title, excerpt: post.excerpt || "", body: post.body || "", author: post.author || "PataFundi Team" });
    setBlogDialog(true);
  };

  const savePost = async (publish: boolean) => {
    if (!blogForm.title.trim() || !blogForm.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setBlogSaving(true);
    try {
      if (editingPost) {
        await apiClient.adminUpdateBlogPost(editingPost.id, {
          title: blogForm.title.trim(),
          excerpt: blogForm.excerpt.trim() || null,
          body: blogForm.body,
          author: blogForm.author.trim() || "PataFundi Team",
          ...(publish ? { status: "published" } : {}),
        });
        toast.success(publish ? "Post published" : "Post saved");
      } else {
        await apiClient.adminCreateBlogPost({
          title: blogForm.title.trim(),
          excerpt: blogForm.excerpt.trim() || null,
          body: blogForm.body,
          author: blogForm.author.trim() || "PataFundi Team",
          status: publish ? "published" : "draft",
        });
        toast.success(publish ? "Post published" : "Draft saved");
      }
      setBlogDialog(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the post");
    } finally {
      setBlogSaving(false);
    }
  };

  const togglePostPublish = async (post: BlogPost) => {
    try {
      await apiClient.adminUpdateBlogPost(post.id, { status: post.status === "published" ? "draft" : "published" });
      toast.success(post.status === "published" ? "Post moved to drafts" : "Post published");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the post");
    }
  };

  const deletePost = async (post: BlogPost) => {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      await apiClient.adminDeleteBlogPost(post.id);
      toast.success("Post deleted");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the post");
    }
  };

  const openNewJob = () => {
    setEditingJob(null);
    setJobForm({ title: "", department: "", location: "Nairobi, Kenya", type: "Full-time", description: "", requirements: "" });
    setJobDialog(true);
  };

  const openEditJob = (job: CareerJob) => {
    setEditingJob(job);
    setJobForm({
      title: job.title,
      department: job.department || "",
      location: job.location || "Nairobi, Kenya",
      type: job.type || "Full-time",
      description: job.description || "",
      requirements: job.requirements || "",
    });
    setJobDialog(true);
  };

  const saveJob = async (open: boolean) => {
    if (!jobForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setJobSaving(true);
    try {
      const payload = {
        title: jobForm.title.trim(),
        department: jobForm.department.trim() || null,
        location: jobForm.location.trim() || null,
        type: jobForm.type,
        description: jobForm.description.trim() || null,
        requirements: jobForm.requirements.trim() || null,
      };
      if (editingJob) {
        await apiClient.adminUpdateCareerJob(editingJob.id, { ...payload, status: open ? "open" : editingJob.status });
        toast.success("Role updated");
      } else {
        await apiClient.adminCreateCareerJob({ ...payload, status: open ? "open" : "closed" });
        toast.success(open ? "Role published" : "Role saved as closed");
      }
      setJobDialog(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the role");
    } finally {
      setJobSaving(false);
    }
  };

  const toggleJobOpen = async (job: CareerJob) => {
    try {
      await apiClient.adminUpdateCareerJob(job.id, { status: job.status === "open" ? "closed" : "open" });
      toast.success(job.status === "open" ? "Role closed" : "Role opened");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the role");
    }
  };

  const deleteJob = async (job: CareerJob) => {
    if (!window.confirm(`Remove the "${job.title}" role? Applications are kept.`)) return;
    try {
      const res = await apiClient.adminDeleteCareerJob(job.id) as { closed?: boolean };
      toast.success(res.closed ? "Role had applications - closed instead of deleted" : "Role removed");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the role");
    }
  };

  const statusPill = (status: string) => {
    const map: Record<string, string> = {
      published: "bg-green-100 text-green-800",
      draft: "bg-yellow-100 text-yellow-800",
      archived: "bg-gray-100 text-gray-800",
      open: "bg-green-100 text-green-800",
      closed: "bg-gray-100 text-gray-800",
      filled: "bg-blue-100 text-blue-800",
    };
    return map[status] || "bg-muted text-muted-foreground";
  };

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Content</h1>
            <p className="text-sm text-muted-foreground">Blog articles and career roles published to the public site.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        <div className="flex gap-2">
          <Button variant={tab === "blog" ? "default" : "outline"} size="sm" onClick={() => setTab("blog")}>
            <Newspaper className="w-4 h-4 mr-2" />Blog ({posts.length})
          </Button>
          <Button variant={tab === "careers" ? "default" : "outline"} size="sm" onClick={() => setTab("careers")}>
            <Briefcase className="w-4 h-4 mr-2" />Careers ({jobs.length})
          </Button>
        </div>

        {loading ? (
          <Card className="p-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading content…
          </Card>
        ) : tab === "blog" ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border/60">
              <p className="font-semibold text-sm">Blog posts</p>
              <Button size="sm" onClick={openNewPost}><Plus className="w-4 h-4 mr-1.5" />New post</Button>
            </div>
            {posts.length === 0 ? (
              <div className="p-10 text-center">
                <Newspaper className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="font-medium">No posts yet</p>
                <p className="text-sm text-muted-foreground">Published posts appear on the public blog page.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {posts.map((post) => (
                  <div key={post.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{post.title}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusPill(post.status)}`}>{post.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">/{post.slug} · {post.author || "Unknown"}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => togglePostPublish(post)} title={post.status === "published" ? "Unpublish" : "Publish"}>
                        {post.status === "published" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditPost(post)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deletePost(post)} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border/60">
              <p className="font-semibold text-sm">Career roles</p>
              <Button size="sm" onClick={openNewJob}><Plus className="w-4 h-4 mr-1.5" />New role</Button>
            </div>
            {jobs.length === 0 ? (
              <div className="p-10 text-center">
                <Briefcase className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="font-medium">No roles listed</p>
                <p className="text-sm text-muted-foreground">Open roles appear on the public careers page.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {jobs.map((job) => (
                  <div key={job.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{job.title}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusPill(job.status)}`}>{job.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{[job.department, job.location, job.type].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleJobOpen(job)} title={job.status === "open" ? "Close role" : "Open role"}>
                        {job.status === "open" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditJob(job)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteJob(job)} title="Remove">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Blog editor dialog */}
      <Dialog open={blogDialog} onOpenChange={setBlogDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPost ? "Edit post" : "New blog post"}</DialogTitle>
            <DialogDescription>
              Draft posts are private. Published posts appear on the public blog immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="post-title">Title *</Label>
              <Input id="post-title" value={blogForm.title} onChange={(e) => setBlogForm((f) => ({ ...f, title: e.target.value }))} placeholder="How escrow keeps everyone safe" maxLength={160} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="post-author">Author</Label>
                <Input id="post-author" value={blogForm.author} onChange={(e) => setBlogForm((f) => ({ ...f, author: e.target.value }))} maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="post-excerpt">Excerpt</Label>
                <Input id="post-excerpt" value={blogForm.excerpt} onChange={(e) => setBlogForm((f) => ({ ...f, excerpt: e.target.value }))} placeholder="One-line summary shown in the list" maxLength={220} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-body">Body *</Label>
              <Textarea id="post-body" value={blogForm.body} onChange={(e) => setBlogForm((f) => ({ ...f, body: e.target.value }))} rows={10} placeholder={"Write the article. Blank lines start new paragraphs. Lines starting with ## become headings."} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlogDialog(false)} disabled={blogSaving}>Cancel</Button>
            <Button variant="outline" onClick={() => savePost(false)} disabled={blogSaving}>
              {blogSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingPost ? "Save" : "Save draft"}
            </Button>
            <Button onClick={() => savePost(true)} disabled={blogSaving}>
              {blogSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingPost ? "Save & publish" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Career editor dialog */}
      <Dialog open={jobDialog} onOpenChange={setJobDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingJob ? "Edit role" : "New career role"}</DialogTitle>
            <DialogDescription>Open roles appear on the public careers page with an application form.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="job-title">Title *</Label>
              <Input id="job-title" value={jobForm.title} onChange={(e) => setJobForm((f) => ({ ...f, title: e.target.value }))} placeholder="Senior Backend Engineer" maxLength={140} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="job-dept">Department</Label>
                <Input id="job-dept" value={jobForm.department} onChange={(e) => setJobForm((f) => ({ ...f, department: e.target.value }))} maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-loc">Location</Label>
                <Input id="job-loc" value={jobForm.location} onChange={(e) => setJobForm((f) => ({ ...f, location: e.target.value }))} maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-type">Type</Label>
                <select
                  id="job-type"
                  value={jobForm.type}
                  onChange={(e) => setJobForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option>Full-time</option>
                  <option>Part-time</option>
                  <option>Contract</option>
                  <option>Internship</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-desc">Description</Label>
              <Textarea id="job-desc" value={jobForm.description} onChange={(e) => setJobForm((f) => ({ ...f, description: e.target.value }))} rows={4} maxLength={4000} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-req">Requirements</Label>
              <Textarea id="job-req" value={jobForm.requirements} onChange={(e) => setJobForm((f) => ({ ...f, requirements: e.target.value }))} rows={4} maxLength={4000} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setJobDialog(false)} disabled={jobSaving}>Cancel</Button>
            <Button onClick={() => saveJob(true)} disabled={jobSaving}>
              {jobSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingJob ? "Save & keep open" : "Publish role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
