"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useResumeStore } from "@/stores/resume";

export function UploadZone() {
  const parsing = useResumeStore((s) => s.parsing);
  const analyzing = useResumeStore((s) => s.analyzing);
  const matching = useResumeStore((s) => s.matching);
  const pdfFilename = useResumeStore((s) => s.pdfFilename);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    // TODO: wire up actual upload + analysis
    console.log("Dropped:", file.name);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: parsing || analyzing,
  });

  const isProcessing = parsing || analyzing || matching;

  return (
    <section
      className="animate-fade-up"
      style={{ "--stagger": 1 } as React.CSSProperties}
    >
      <div
        {...getRootProps()}
        className={cn(
          "group relative cursor-pointer rounded-2xl border border-dashed transition-all duration-300",
          isDragActive
            ? "border-primary bg-primary/[0.03] shadow-[0_0_0_3px_oklch(0.65_0.14_42/0.1)]"
            : "border-border hover:border-primary/30",
          isProcessing && "pointer-events-none",
        )}
      >
        <input {...getInputProps()} />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-8 px-8 py-14">
            <Loader2
              className="size-6 animate-spin text-primary"
              strokeWidth={1.5}
            />
            <div className="flex gap-12">
              <Step label="Reading" done={!parsing} active={parsing} />
              <Step
                label="Analyzing"
                done={
                  !analyzing &&
                  !!useResumeStore.getState().analysisResult
                }
                active={analyzing}
              />
              <Step
                label="Matching"
                done={
                  !matching &&
                  !!useResumeStore.getState().jobMatchResult
                }
                active={matching}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-8 py-14">
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-xl transition-all duration-300",
                pdfFilename
                  ? "bg-positive-muted"
                  : "bg-surface-2 group-hover:bg-primary/[0.06] group-hover:scale-105",
              )}
            >
              {pdfFilename ? (
                <FileText
                  className="size-5 text-positive"
                  strokeWidth={1.5}
                />
              ) : (
                <Upload
                  className="size-5 text-foreground/20 group-hover:text-primary transition-colors"
                  strokeWidth={1.5}
                />
              )}
            </div>
            <div className="text-center">
              <p className="text-[14px] font-medium text-foreground/70">
                {pdfFilename || "Drop your resume here"}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {pdfFilename
                  ? "Drop a new file to replace"
                  : "PDF up to 10 MB"}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Step({
  label,
  done,
  active,
}: {
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          "flex size-8 items-center justify-center rounded-lg text-xs font-semibold transition-all",
          done
            ? "bg-positive-muted text-positive"
            : active
              ? "bg-primary/10 text-primary"
              : "bg-surface-2 text-foreground/15",
        )}
      >
        {done ? (
          <Check className="size-3.5" strokeWidth={2.5} />
        ) : active ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <span className="size-1 rounded-full bg-current" />
        )}
      </div>
      <span
        className={cn(
          "text-[11px] font-medium",
          done
            ? "text-positive"
            : active
              ? "text-foreground"
              : "text-foreground/15",
        )}
      >
        {label}
      </span>
    </div>
  );
}
