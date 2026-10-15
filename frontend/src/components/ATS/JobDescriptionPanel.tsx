import { FileText, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JobDescriptionPanelProps {
  value: string;
  onChange: (value: string) => void;
  onAutoGenerate?: () => void;
  isAutoGenerating?: boolean;
  hasResume?: boolean;
}

export default function JobDescriptionPanel({
  value,
  onChange,
  onAutoGenerate,
  isAutoGenerating,
  hasResume,
}: JobDescriptionPanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-lg flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg">Target Job Description</h3>
          </div>

          {onAutoGenerate && hasResume && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAutoGenerate}
              disabled={isAutoGenerating}
              className="text-xs h-8 gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            >
              {isAutoGenerating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Auto-Detect from Resume</span>
            </Button>
          )}
        </div>

        <div className="mb-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
          <span>
            <strong>Smart Matching:</strong> If you leave this blank, clicking <strong>Analyze Resume</strong> will automatically generate a job description matching the skills found in your resume!
          </span>
        </div>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-56 bg-background border border-border rounded-lg p-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          placeholder="Optional: Paste a specific job description, OR leave blank to automatically detect suitable roles from your uploaded resume skills...

Example:
Role: Senior Full Stack Engineer
Requirements:
- Python, React, TypeScript, APIs
- Experience building scalable cloud services"
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{value.length} characters</span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-destructive hover:underline"
          >
            Clear Job Description
          </button>
        )}
      </div>
    </div>
  );
}
