import { Button } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Upload } from "lucide-react";
import { useCallback, useState } from "react";

interface CSVUploadZoneProps {
  errorInvalidFile: string;
  isLoading?: boolean;
  onError?: (message: string) => void;
  onFileLoaded: (content: string, filename: string) => void;
  processingLabel: string;
  selectFileLabel: string;
  uploadHint: string;
  uploadTitle: string;
}

export function CSVUploadZone({
  onFileLoaded,
  onError,
  isLoading,
  errorInvalidFile,
  processingLabel,
  selectFileLabel,
  uploadTitle,
  uploadHint,
}: CSVUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        onError?.(errorInvalidFile);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = (e.target?.result as string) || "";
        onFileLoaded(content, file.name);
      };
      reader.onerror = () => {
        onError?.(errorInvalidFile);
      };
      reader.readAsText(file);
    },
    [errorInvalidFile, onFileLoaded]
  );

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25"
      } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
          handleFile(file);
        }
      }}
    >
      {isLoading ? (
        <>
          <AnimatedLoaderIcon
            className="mx-auto mb-4 text-primary"
            play="always"
            size={48}
          />
          <h3 className="mb-2 font-semibold text-lg">{processingLabel}</h3>
        </>
      ) : (
        <>
          <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 font-semibold text-lg">{uploadTitle}</h3>
          <p className="mb-4 text-muted-foreground text-sm">{uploadHint}</p>
          <input
            accept=".csv"
            className="hidden"
            disabled={isLoading}
            id="csv-import-upload"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFile(file);
              }
            }}
            type="file"
          />
          <Button asChild variant="outline">
            <label className="cursor-pointer" htmlFor="csv-import-upload">
              {selectFileLabel}
            </label>
          </Button>
        </>
      )}
    </div>
  );
}
