import React, { useState, useEffect } from "react";
import { Briefcase, Loader2, Filter, AlertCircle, Sparkles, Building2, MapPin, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { jobsService, type JobPosting } from "@/services/jobsService";
import { Link } from "react-router-dom";

export default function RecommendedJobs() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobRole, setJobRole] = useState("all");
  const [enableFiltering, setEnableFiltering] = useState(true);
  const { toast } = useToast();

  const roleOptions = [
    { key: "all", display_name: "All Verified Roles" },
    { key: "engineer", display_name: "Software & Cloud Engineering" },
    { key: "data", display_name: "Data Science & AI / ML" },
    { key: "product", display_name: "Product & Project Management" },
    { key: "design", display_name: "UI / UX Design" },
  ];

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);

    try {
      const allJobs = await jobsService.getJobs();
      let filtered = allJobs;

      if (enableFiltering && jobRole !== "all") {
        const q = jobRole.toLowerCase();
        filtered = allJobs.filter(j =>
          j.title?.toLowerCase().includes(q) ||
          j.description?.toLowerCase().includes(q)
        );
      }

      setJobs(filtered);
      toast({
        title: "Recommended Jobs Updated",
        description: `Loaded ${filtered.length} matching jobs from the database.`,
      });
    } catch (err: any) {
      console.error("Failed to fetch recommended jobs:", err);
      setError(err?.message || "Failed to load jobs from database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [jobRole, enableFiltering]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Recommended Jobs
          </CardTitle>
          <CardDescription>
            Personalized job recommendations verified and published by our recruiter partners
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 mb-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="job-role" className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Target Career Track
              </Label>
              <Select value={jobRole} onValueChange={setJobRole}>
                <SelectTrigger id="job-role">
                  <SelectValue placeholder="Select a job role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.key} value={role.key}>
                      {role.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 sm:col-span-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enable-filtering"
                  checked={enableFiltering}
                  onCheckedChange={(checked) => setEnableFiltering(checked as boolean)}
                />
                <Label htmlFor="enable-filtering" className="text-sm font-normal cursor-pointer">
                  Filter jobs matching selected career track
                </Label>
              </div>
            </div>
          </div>

          <Button onClick={fetchJobs} disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating Jobs...
              </>
            ) : (
              "Refresh Recommendations"
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Matching Positions ({jobs.length})</CardTitle>
                <CardDescription>Verified opportunities ready for instant submission</CardDescription>
              </div>
              <Badge variant="outline" className="text-primary border-primary">
                Active Listings
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Employment Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{job.title}</TableCell>
                      <TableCell className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        {job.companies?.name || "AutoAgentHire Partner"}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5" />
                          {job.location || "Remote"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{job.employment_type || "Full-time"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          {job.status || "active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" asChild>
                          <Link to="/candidate/jobs">View Details</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
